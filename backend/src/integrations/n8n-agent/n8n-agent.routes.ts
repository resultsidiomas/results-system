import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { HttpError, BadRequestError, UnauthorizedError } from '../../shared/http-errors.js';
import { findOrCreateContact, updatePausarIa } from '../../crm/leads/contacts.repository.js';
import type { Contact } from '../../crm/leads/contacts.repository.js';
import { routeAgent } from '../../agents/router/agent.router.js';
import { getChatHistory } from '../../agents/shared/agent.memory.redis.js';
import { runCommercialTurn } from '../../agents/commercial/commercial.service.js';
import { runSupportTurn } from '../../agents/support/support.service.js';
import { shouldReactivate } from '../../agents/shared/agent.reactivation.js';
import { isPauseExpired, clearPauseStart } from '../../agents/shared/agent.pause.js';
import { sendPriceTableImage } from '../../whatsapp/uazapi/uazapi.sender.js';
import { PRICE_TABLE_VARIANTS } from '../../agents/commercial/commercial.schema.js';
import { isTestPhone } from '../../shared/test-contact.js';

const bodySchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1),
  contexto: z.record(z.string(), z.unknown()).optional(),
});

const sendPriceTableBodySchema = z.object({
  sessionId: z.string().min(1),
  variant: z.enum(PRICE_TABLE_VARIANTS).default('geral'),
});

function requireInternalAuth(request: FastifyRequest): void {
  const token = request.headers['x-internal-key'];
  if (token !== env.INTERNAL_API_KEY) {
    throw new UnauthorizedError('invalid internal key');
  }
}

function readString(contexto: Record<string, unknown> | undefined, key: string): string {
  const value = contexto?.[key];
  return typeof value === 'string' ? value : '';
}

interface RunResult {
  reply: string;
  sendPriceTable: boolean;
  priceTableVariant: string | null;
  handoff: boolean;
  pauseAi: boolean;
}


async function runRoutedTurn(
  contact: Awaited<ReturnType<typeof findOrCreateContact>>,
  instanceName: string,
  remoteJid: string,
  message: string,
  notifyHandoff: boolean,
): Promise<RunResult> {
  // Histórico entra no roteamento pra mensagem curta ("sim", "e o horário?")
  // não trocar de agente no meio da conversa.
  const history = await getChatHistory(instanceName, remoteJid);
  const agentType = await routeAgent(contact, message, history);

  if (agentType === 'support') {
    const turn = await runSupportTurn(contact, instanceName, remoteJid, message, { notifyHandoff });
    return {
      reply: turn.reply,
      sendPriceTable: false,
      priceTableVariant: null,
      handoff: turn.handoff,
      pauseAi: turn.pauseAi,
    };
  }

  const turn = await runCommercialTurn(contact, instanceName, remoteJid, message, { notifyHandoff });
  return {
    reply: turn.reply,
    sendPriceTable: turn.sendPriceTable,
    priceTableVariant: turn.sendPriceTable ? turn.priceTableVariant : null,
    handoff: turn.handoff,
    pauseAi: turn.pauseAi,
  };
}

export async function n8nAgentRoutes(app: FastifyInstance) {
  app.post('/api/v1/n8n-agent/run', async (request: FastifyRequest, reply: FastifyReply) => {
    requireInternalAuth(request);

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError('invalid request body');

    const { message, sessionId, contexto } = parsed.data;
    // sessionId vem do n8n como message.chatid — mesmo valor usado como
    // remoteJid pelo caminho antigo (uazapi.webhook.ts).
    const remoteJid = sessionId;
    const phone = remoteJid.split('@')[0];
    const senderName = readString(contexto, 'senderName') || readString(contexto, 'chatName');
    const instanceName = readString(contexto, 'instanceName') || env.UAZAPI_INSTANCE;

    let contact: Contact;
    try {
      contact = await findOrCreateContact(phone, senderName);
    } catch (err) {
      logger.error('n8n-agent contact lookup failed', { sessionId, errorMessage: (err as Error).message });
      throw new HttpError(502, 'falha ao identificar contato');
    }

    // Pausa tem prazo (AGENT_PAUSE_MAX_HOURS = 1 dia). Sem isso `pausar_ia`
    // nunca destrava sozinha — não existe rotina de resume implementada.
    if (contact.pausar_ia === 'Sim' && (await isPauseExpired(contact.id, contact.updated_at))) {
      logger.info('pausa expirou, IA reassume o contato', { sessionId });
      await updatePausarIa(contact.id, 'Não');
      await clearPauseStart(contact.id);
      contact = { ...contact, pausar_ia: 'Não' as const };
    }

    if (contact.pausar_ia === 'Sim') {
      // Handoff já aconteceu (Gi está com o contato). Só volta a falar se a
      // mensagem for uma dúvida real — nunca reabre score/handoff de novo
      // (notifyHandoff:false) pra não reencaminhar/alertar a Gi de novo
      // pela mesma coisa. Depois de responder, volta pra pausado — a
      // próxima mensagem passa pela mesma checagem (ver ADR-011).
      const wantsToContinue = await shouldReactivate(message);
      if (!wantsToContinue) {
        return reply.send({
          reply: null,
          sendPriceTable: false,
          priceTableVariant: null,
          sessionId,
          pausarIa: 'Sim',
        });
      }

      const result = await runRoutedTurn({ ...contact, pausar_ia: 'Não' }, instanceName, remoteJid, message, false);
      await updatePausarIa(contact.id, 'Sim');

      return reply.send({
        reply: result.reply,
        sendPriceTable: result.sendPriceTable,
        priceTableVariant: result.priceTableVariant,
        sessionId,
        pausarIa: 'Sim',
      });
    }

    // Contato sintético do console de teste: calcula handoff normalmente (é o
    // que a equipe quer observar no painel), mas não manda WhatsApp pra Gi com
    // lead que não existe. O fluxo do n8n chama esta mesma rota no modo de
    // teste e não tem como sinalizar isso — quem sabe é o formato do telefone.
    const result = await runRoutedTurn(
      contact,
      instanceName,
      remoteJid,
      message,
      !isTestPhone(contact.phone),
    );
    // `handoff` só significa "Gi foi avisada" — não implica mais silêncio.
    // Score alto/falha técnica alertam a Gi e a IA continua na conversa.
    const pausarIa = result.pauseAi ? 'Sim' : 'Não';

    return reply.send({
      reply: result.reply,
      sendPriceTable: result.sendPriceTable,
      priceTableVariant: result.priceTableVariant,
      sessionId,
      pausarIa,
    });
  });

  // Chamado pelo n8n só DEPOIS que todos os blocos de texto já foram
  // enviados (loop de fracionamento) — garante que a tabela chega depois
  // do "vou te mandar a tabela", nunca antes (ADR-012).
  app.post('/api/v1/n8n-agent/send-price-table', async (request: FastifyRequest, reply: FastifyReply) => {
    requireInternalAuth(request);

    const parsed = sendPriceTableBodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError('invalid request body');

    const { sessionId, variant } = parsed.data;

    try {
      await sendPriceTableImage(sessionId, variant);
    } catch (err) {
      logger.error('n8n-agent send-price-table failed', { sessionId, errorMessage: (err as Error).message });
      throw new HttpError(502, 'falha ao enviar tabela de precos');
    }

    return reply.send({ status: 'ok' });
  });
}
