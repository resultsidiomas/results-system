import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { uazapiWebhookSchema } from './uazapi.schema.js';
import type { UazapiWebhookPayload } from './uazapi.schema.js';
import { downloadMedia } from './uazapi.download.js';
import { transcribeAudio } from '../../media/audio.transcriber.js';
import { analyzeImage } from '../../media/image.analyzer.js';
import { findOrCreateContact } from '../../crm/leads/contacts.repository.js';
import { isBlocked, setBlock } from '../../agents/shared/agent.pause.js';
import { appendChatMessage, getChatHistory } from '../../agents/shared/agent.memory.redis.js';
import { joinMessages } from '../../agents/shared/agent.message-join.js';
import { isDuplicateMessage } from '../../agents/shared/agent.dedupe.js';
import { routeAgent } from '../../agents/router/agent.router.js';
import { runCommercialTurn } from '../../agents/commercial/commercial.service.js';
import { runSupportTurn } from '../../agents/support/support.service.js';
import { sendFractured, sendPriceTableImage } from './uazapi.sender.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { UnauthorizedError, BadRequestError } from '../../shared/http-errors.js';

/** Mídia que não deu pra ler — melhor pedir texto que ficar mudo. */
const MEDIA_FALLBACK_REPLY =
  'Não consegui abrir o arquivo que você mandou aqui. Você pode escrever por mensagem de texto o que precisa?';

function isAllowedTestNumber(remoteJid: string): boolean {
  if (!env.TEST_ALLOWED_NUMBERS) return true;

  const allowlist = env.TEST_ALLOWED_NUMBERS.split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  return allowlist.length === 0 || allowlist.includes(remoteJid);
}

async function resolveMessageText(
  messageId: string,
  messageType: string,
  rawContent: string,
): Promise<string> {
  const type = messageType.toLowerCase();

  if (type === 'audiomessage') {
    const { base64, mimeType } = await downloadMedia(messageId);
    return transcribeAudio(Buffer.from(base64, 'base64'), mimeType);
  }

  if (type === 'imagemessage') {
    const { base64, mimeType } = await downloadMedia(messageId);
    return analyzeImage(base64, mimeType);
  }

  return rawContent;
}

export async function uazapiWebhookRoute(app: FastifyInstance) {
  app.post('/api/v1/webhook/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const { token: queryToken } = request.query as { token?: string };
    const token = request.headers['x-webhook-token'] ?? queryToken;
    if (token !== env.UAZAPI_WEBHOOK_SECRET) {
      throw new UnauthorizedError('invalid webhook token');
    }

    const parsed = uazapiWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('invalid webhook payload');
    }

    const { instanceName, chat, message } = parsed.data;

    if (instanceName !== env.UAZAPI_INSTANCE) {
      logger.warn('webhook from unknown instance', { instanceName });
      return reply.status(200).send({ status: 'ignored', reason: 'unknown_instance' });
    }

    const remoteJid = chat.wa_chatid;

    // Grupo não é atendimento — o agente respondendo em grupo é ruído puro.
    if (message.isGroup) {
      return reply.status(200).send({ status: 'ignored', reason: 'group_chat' });
    }

    // UAZAPI reentrega o mesmo evento quando o webhook demora ou responde erro.
    // Sem dedupe, a retentativa vira segunda resposta pro mesmo texto.
    if (await isDuplicateMessage(message.id)) {
      return reply.status(200).send({ status: 'ignored', reason: 'duplicate_message' });
    }

    if (message.fromMe) {
      // Eco da própria IA: toda mensagem que o backend manda pela UAZAPI volta
      // como `fromMe: true`. Tratar isso como atendimento humano fazia o agente
      // se auto-bloquear por AGENT_BLOCK_TTL_SECONDS depois de cada resposta —
      // o "parou de responder do nada" (ver ADR-014). `wasSentByApi` separa os
      // dois casos.
      if (message.wasSentByApi) {
        return reply.status(200).send({ status: 'ignored', reason: 'own_message_echo' });
      }

      // Atendimento humano de verdade (staff respondeu pelo WhatsApp): pausa a
      // IA e registra a mensagem pro contexto seguir coerente quando voltar.
      await setBlock(remoteJid);
      await appendChatMessage(instanceName, remoteJid, {
        role: 'assistant',
        content: message.content,
        at: new Date().toISOString(),
      });
      return reply.status(200).send({ status: 'ok', reason: 'human_takeover' });
    }

    if (!isAllowedTestNumber(remoteJid)) {
      return reply.status(200).send({ status: 'ignored', reason: 'not_in_test_allowlist' });
    }

    // ACK imediato. O turno leva AGENT_MESSAGE_WAIT_MS (junção anti-flood) +
    // chamada de modelo + envio; segurar a requisição até o fim estourava o
    // timeout do webhook da UAZAPI, que reentregava o evento — dupla resposta
    // pro lead. O processamento segue em background e loga o próprio erro.
    void handleIncomingMessage(instanceName, remoteJid, chat.wa_name, message).catch((err) => {
      logger.error('webhook processing failed', {
        remoteJid,
        messageId: message.id,
        errorMessage: (err as Error).message,
      });
    });

    return reply.status(200).send({ status: 'accepted' });
  });
}

async function handleIncomingMessage(
  instanceName: string,
  remoteJid: string,
  senderName: string,
  message: UazapiWebhookPayload['message'],
): Promise<void> {
  const phone = message.chatid.split('@')[0] ?? '';
  const contact = await findOrCreateContact(phone, senderName);

  if (contact.pausar_ia === 'Sim') return;

  if (await isBlocked(remoteJid)) {
    await appendChatMessage(instanceName, remoteJid, {
      role: 'user',
      content: message.content,
      at: new Date().toISOString(),
    });
    return;
  }

  // Áudio/imagem dependem de download + Groq/vision. Falha aqui derrubava o
  // turno inteiro (500, lead sem resposta nenhuma) em vez de pedir texto.
  let text: string;
  try {
    text = await resolveMessageText(message.id, message.messageType, message.content);
  } catch (err) {
    logger.error('media resolution failed, asking for text', {
      messageType: message.messageType,
      errorMessage: (err as Error).message,
    });
    await sendFractured(remoteJid, MEDIA_FALLBACK_REPLY);
    return;
  }

  if (text.trim().length === 0) return;

  const joined = await joinMessages(remoteJid, message.id, text);
  if (joined === null) return;

  // Histórico entra no roteamento: mensagem curta ("sim", "e o horário?") não
  // pode trocar de agente no meio da conversa.
  const history = await getChatHistory(instanceName, remoteJid);
  const agentType = await routeAgent(contact, joined, history);
  logger.info('message routed', { instanceName, agentType });

  if (agentType === 'commercial') {
    const turn = await runCommercialTurn(contact, instanceName, remoteJid, joined);
    await sendFractured(remoteJid, turn.reply);
    // Tabela só depois do texto ter saído de verdade — nunca antes (ADR-012).
    if (turn.sendPriceTable) {
      await sendPriceTableImage(remoteJid, turn.priceTableVariant);
    }
    return;
  }

  const supportTurn = await runSupportTurn(contact, instanceName, remoteJid, joined);
  await sendFractured(remoteJid, supportTurn.reply);
}
