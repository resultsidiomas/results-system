import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logger } from '../shared/logger.js';
import { BadRequestError } from '../shared/http-errors.js';
import { requireAdmin } from './admin.auth.js';
import {
  findOrCreateContact,
  findContactByPhone,
  deleteContact,
} from '../crm/leads/contacts.repository.js';
import { findConversation } from '../agents/shared/agent.memory.pg.js';
import type { Conversation } from '../agents/shared/agent.memory.pg.js';
import { clearChatHistory, getChatHistory } from '../agents/shared/agent.memory.redis.js';
import { clearBlock } from '../agents/shared/agent.pause.js';
import { routeAgent } from '../agents/router/agent.router.js';
import { runCommercialTurn } from '../agents/commercial/commercial.service.js';
import { runSupportTurn } from '../agents/support/support.service.js';
import { fractureMessage } from '../agents/shared/agent.fracture.js';
import { isN8nTestConfigured, runN8nTestFlow } from '../testing/n8n-test-flow.js';

const TEST_INSTANCE = 'test-console';

const sessionIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'sessão só aceita letras, números, hífen e underscore');

const messageBodySchema = z.object({
  message: z.string().min(1).max(4000),
  /** Força o caminho direto mesmo com n8n configurado — útil pra isolar onde um problema está. */
  bypassN8n: z.boolean().optional(),
});

/** O contato de teste é um telefone sintético: nunca colide com número real da UAZAPI. */
function testPhone(sessionId: string): string {
  return `test-${sessionId}`;
}

function parseSessionId(request: FastifyRequest): string {
  const parsed = sessionIdSchema.safeParse((request.params as { sessionId?: string }).sessionId);
  if (!parsed.success) throw new BadRequestError('sessão inválida');
  return parsed.data;
}

/** Contato pode ter conversa comercial e de suporte (roteadas por mensagem) — mostra a mais recente. */
function pickMostRecent(a: Conversation | null, b: Conversation | null): Conversation | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a.updated_at) > new Date(b.updated_at) ? a : b;
}

export async function adminTestChatRoutes(app: FastifyInstance) {
  /** Estado da sessão: histórico, score, dados coletados e qual caminho de teste está ativo. */
  app.get('/api/v1/admin/test-chat/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdmin(request);
    const sessionId = parseSessionId(request);

    const contact = await findContactByPhone(testPhone(sessionId));

    const base = {
      viaN8n: isN8nTestConfigured(),
      messages: [] as unknown[],
      leadScore: 0,
      collectedData: {},
      pausarIa: 'Não',
    };

    if (!contact) return reply.send(base);

    const [commercial, support] = await Promise.all([
      findConversation(contact.id, 'commercial'),
      findConversation(contact.id, 'support'),
    ]);

    const conversation = pickMostRecent(commercial, support);
    if (!conversation) return reply.send({ ...base, pausarIa: contact.pausar_ia });

    return reply.send({
      ...base,
      messages: conversation.messages,
      leadScore: conversation.lead_score,
      collectedData: conversation.collected_data,
      pausarIa: contact.pausar_ia,
    });
  });

  /**
   * Manda uma mensagem como se fosse o lead.
   *
   * Com `N8N_TEST_WEBHOOK_URL` configurada, o turno passa pelo fluxo REAL do
   * n8n (webhook, filtros, debounce, fracionamento) e só o envio pela UAZAPI é
   * desviado. Sem ela, roda a engine direto no backend. A resposta sempre diz
   * qual caminho respondeu (`via`), pra leitura do teste não ficar ambígua.
   */
  app.post('/api/v1/admin/test-chat/:sessionId/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(request);
    const sessionId = parseSessionId(request);

    const parsed = messageBodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'mensagem inválida');

    const { message, bypassN8n } = parsed.data;
    const startedAt = Date.now();

    if (isN8nTestConfigured() && !bypassN8n) {
      const result = await runN8nTestFlow({
        sessionId,
        message,
        senderName: 'Teste (Console)',
        instance: TEST_INSTANCE,
      });

      logger.info('test console turn via n8n', { sessionId, by: user.email });

      return reply.send({
        via: 'n8n',
        reply: result.reply,
        bubbles: result.bubbles,
        sendPriceTable: result.sendPriceTable,
        priceTableVariant: result.priceTableVariant,
        pausarIa: result.pausarIa,
        elapsedMs: Date.now() - startedAt,
        raw: result.raw,
      });
    }

    const contact = await findOrCreateContact(testPhone(sessionId), 'Teste (Console)');
    const history = await getChatHistory(TEST_INSTANCE, sessionId);
    const agentType = await routeAgent(contact, message, history);

    // `notifyHandoff: false`: o handoff é calculado e devolvido normalmente, mas
    // a Gi não recebe WhatsApp com dado fictício de teste.
    if (agentType === 'support') {
      const turn = await runSupportTurn(contact, TEST_INSTANCE, sessionId, message, {
        notifyHandoff: false,
      });

      logger.info('test console turn (backend)', { sessionId, agentType, by: user.email });

      return reply.send({
        via: 'backend',
        reply: turn.reply,
        bubbles: fractureMessage(turn.reply),
        agentType,
        handoff: turn.handoff,
        pauseAi: turn.pauseAi,
        escalationReason: turn.escalationReason,
        sendPriceTable: false,
        leadScore: 0,
        elapsedMs: Date.now() - startedAt,
      });
    }

    const turn = await runCommercialTurn(contact, TEST_INSTANCE, sessionId, message, {
      notifyHandoff: false,
    });

    logger.info('test console turn (backend)', {
      sessionId,
      agentType,
      leadScore: turn.leadScore,
      handoff: turn.handoff,
      by: user.email,
    });

    return reply.send({
      via: 'backend',
      reply: turn.reply,
      bubbles: fractureMessage(turn.reply),
      agentType,
      handoff: turn.handoff,
      pauseAi: turn.pauseAi,
      escalationReason: null,
      sendPriceTable: turn.sendPriceTable,
      priceTableVariant: turn.priceTableVariant,
      leadScore: turn.leadScore,
      elapsedMs: Date.now() - startedAt,
    });
  });

  /** Zera a sessão: memória curta, bloqueio, contato e conversas. */
  app.delete('/api/v1/admin/test-chat/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(request);
    const sessionId = parseSessionId(request);

    await clearChatHistory(TEST_INSTANCE, sessionId);
    await clearBlock(sessionId);

    const contact = await findContactByPhone(testPhone(sessionId));
    if (contact) await deleteContact(contact.id);

    logger.info('test console session reset', { sessionId, by: user.email });
    return reply.send({ status: 'reset' });
  });
}
