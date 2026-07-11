import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { uazapiWebhookSchema } from './uazapi.schema.js';
import { downloadMedia } from './uazapi.download.js';
import { transcribeAudio } from '../../media/audio.transcriber.js';
import { analyzeImage } from '../../media/image.analyzer.js';
import { findOrCreateContact } from '../../crm/leads/contacts.repository.js';
import { isBlocked, setBlock } from '../../agents/shared/agent.pause.js';
import { appendChatMessage } from '../../agents/shared/agent.memory.redis.js';
import { joinMessages } from '../../agents/shared/agent.message-join.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { UnauthorizedError, BadRequestError } from '../../shared/http-errors.js';

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
    const token = request.headers['x-webhook-token'];
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
    const phone = message.chatid.split('@')[0];

    const contact = await findOrCreateContact(phone, chat.wa_name);

    if (contact.pausar_ia === 'Sim') {
      return reply.status(200).send({ status: 'ignored', reason: 'pausar_ia' });
    }

    const text = await resolveMessageText(message.id, message.messageType, message.content);

    if (message.fromMe) {
      // Staff replied manually from the WhatsApp app itself — pause the AI
      // for this contact and log the message so context stays coherent
      // once the AI resumes (see ADR-007 note on Vespa reference flow).
      await setBlock(remoteJid);
      await appendChatMessage(instanceName, remoteJid, {
        role: 'assistant',
        content: text,
        at: new Date().toISOString(),
      });
      return reply.status(200).send({ status: 'ok', reason: 'human_takeover' });
    }

    if (await isBlocked(remoteJid)) {
      await appendChatMessage(instanceName, remoteJid, {
        role: 'user',
        content: text,
        at: new Date().toISOString(),
      });
      return reply.status(200).send({ status: 'ok', reason: 'blocked' });
    }

    const joined = await joinMessages(remoteJid, text);
    if (joined === null) {
      return reply.status(200).send({ status: 'ok', reason: 'superseded' });
    }

    logger.info('message ready for routing', { instanceName });
    // Parte 4 plugs in here: route joined message to agent.router.ts
    return reply.status(200).send({ status: 'ok' });
  });
}
