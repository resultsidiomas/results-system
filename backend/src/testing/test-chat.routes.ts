import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';
import { UnauthorizedError, BadRequestError } from '../shared/http-errors.js';
import {
  findOrCreateContact,
  findContactByPhone,
  deleteContact,
} from '../crm/leads/contacts.repository.js';
import { findConversation } from '../agents/shared/agent.memory.pg.js';
import type { Conversation } from '../agents/shared/agent.memory.pg.js';
import { clearChatHistory } from '../agents/shared/agent.memory.redis.js';
import { clearBlock } from '../agents/shared/agent.pause.js';
import { routeAgent } from '../agents/router/agent.router.js';
import { runCommercialTurn } from '../agents/commercial/commercial.service.js';
import { runSupportTurn } from '../agents/support/support.service.js';
import { testChatSessionIdSchema, testChatMessageBodySchema } from './test-chat.schema.js';

const TEST_INSTANCE = 'test-console';

function testPhone(sessionId: string): string {
  return `test-${sessionId}`;
}

function requireTestConsoleAuth(request: FastifyRequest): void {
  const token = request.headers['x-test-console-token'];
  if (token !== env.TEST_CONSOLE_TOKEN) {
    throw new UnauthorizedError('invalid test console token');
  }
}

function parseSessionId(request: FastifyRequest): string {
  const { sessionId } = request.params as { sessionId?: string };
  const parsed = testChatSessionIdSchema.safeParse(sessionId);
  if (!parsed.success) throw new BadRequestError('invalid session id');
  return parsed.data;
}

/** Contato pode ter uma conversa comercial e uma de suporte (roteadas por mensagem, não por sessão) — mostra a mais recente. */
function pickMostRecent(a: Conversation | null, b: Conversation | null): Conversation | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a.updated_at) > new Date(b.updated_at) ? a : b;
}

export async function testChatRoutes(app: FastifyInstance) {
  app.get('/api/v1/test-chat/:sessionId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    requireTestConsoleAuth(request);
    const sessionId = parseSessionId(request);

    const contact = await findContactByPhone(testPhone(sessionId));
    if (!contact) {
      return reply.send({ messages: [], leadScore: 0, collectedData: {} });
    }

    const [commercial, support] = await Promise.all([
      findConversation(contact.id, 'commercial'),
      findConversation(contact.id, 'support'),
    ]);
    const conversation = pickMostRecent(commercial, support);
    if (!conversation) {
      return reply.send({ messages: [], leadScore: 0, collectedData: {} });
    }

    return reply.send({
      messages: conversation.messages,
      leadScore: conversation.lead_score,
      collectedData: conversation.collected_data,
    });
  });

  app.post('/api/v1/test-chat/:sessionId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    requireTestConsoleAuth(request);
    const sessionId = parseSessionId(request);

    const parsedBody = testChatMessageBodySchema.safeParse(request.body);
    if (!parsedBody.success) throw new BadRequestError('invalid message body');

    const contact = await findOrCreateContact(testPhone(sessionId), 'Teste (Console)');
    const agentType = await routeAgent(contact, parsedBody.data.message);

    if (agentType === 'support') {
      const turn = await runSupportTurn(contact, TEST_INSTANCE, sessionId, parsedBody.data.message, {
        notifyHandoff: false,
      });

      logger.info('test console turn', {
        sessionId,
        agentType,
        handoff: turn.handoff,
        escalationReason: turn.escalationReason,
      });

      return reply.send({
        reply: turn.reply,
        leadScore: 0,
        handoff: turn.handoff,
        sendPriceTable: false,
        agentType,
        escalationReason: turn.escalationReason,
      });
    }

    const turn = await runCommercialTurn(contact, TEST_INSTANCE, sessionId, parsedBody.data.message, {
      notifyHandoff: false,
    });

    logger.info('test console turn', {
      sessionId,
      agentType,
      leadScore: turn.leadScore,
      handoff: turn.handoff,
      sendPriceTable: turn.sendPriceTable,
    });

    return reply.send({
      reply: turn.reply,
      leadScore: turn.leadScore,
      handoff: turn.handoff,
      sendPriceTable: turn.sendPriceTable,
      agentType,
      escalationReason: null,
    });
  });

  app.delete('/api/v1/test-chat/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    requireTestConsoleAuth(request);
    const sessionId = parseSessionId(request);

    await clearChatHistory(TEST_INSTANCE, sessionId);
    await clearBlock(sessionId);

    const contact = await findContactByPhone(testPhone(sessionId));
    if (contact) await deleteContact(contact.id);

    logger.info('test console session reset', { sessionId });
    return reply.send({ status: 'reset' });
  });
}
