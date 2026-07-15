import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { logger } from '../shared/logger.js';
import { UnauthorizedError, BadRequestError } from '../shared/http-errors.js';
import {
  findOrCreateContact,
  findContactByPhone,
  deleteContact,
} from '../crm/leads/contacts.repository.js';
import { getOrCreateConversation } from '../agents/shared/agent.memory.pg.js';
import { clearChatHistory } from '../agents/shared/agent.memory.redis.js';
import { clearBlock } from '../agents/shared/agent.pause.js';
import { runCommercialTurn } from '../agents/commercial/commercial.service.js';
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

export async function testChatRoutes(app: FastifyInstance) {
  app.get('/api/v1/test-chat/:sessionId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    requireTestConsoleAuth(request);
    const sessionId = parseSessionId(request);

    const contact = await findContactByPhone(testPhone(sessionId));
    if (!contact) {
      return reply.send({ messages: [], leadScore: 0, collectedData: {} });
    }

    const conversation = await getOrCreateConversation(contact.id, 'commercial');
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
    const turn = await runCommercialTurn(contact, TEST_INSTANCE, sessionId, parsedBody.data.message, {
      notifyHandoff: false,
    });

    logger.info('test console turn', {
      sessionId,
      leadScore: turn.leadScore,
      handoff: turn.handoff,
      sendPriceTable: turn.sendPriceTable,
    });

    return reply.send({
      reply: turn.reply,
      leadScore: turn.leadScore,
      handoff: turn.handoff,
      sendPriceTable: turn.sendPriceTable,
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
