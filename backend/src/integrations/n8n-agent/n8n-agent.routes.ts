import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { HttpError, BadRequestError, UnauthorizedError } from '../../shared/http-errors.js';
import { findOrCreateContact } from '../../crm/leads/contacts.repository.js';
import { runCommercialTurn } from '../../agents/commercial/commercial.service.js';

const bodySchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1),
  contexto: z.record(z.string(), z.unknown()).optional(),
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

    let contact;
    try {
      contact = await findOrCreateContact(phone, senderName);
    } catch (err) {
      logger.error('n8n-agent contact lookup failed', { sessionId, errorMessage: (err as Error).message });
      throw new HttpError(502, 'falha ao identificar contato');
    }

    if (contact.pausar_ia === 'Sim') {
      return reply.send({ reply: null, sendPriceTable: false, sessionId, reason: 'pausar_ia' });
    }

    // Sem roteador M1/M2 aqui: agente de suporte (M2) ainda não existe
    // (ADR-010) — sempre responde via engine comercial.
    const turn = await runCommercialTurn(contact, instanceName, remoteJid, message);

    return reply.send({ reply: turn.reply, sendPriceTable: turn.sendPriceTable, sessionId });
  });
}
