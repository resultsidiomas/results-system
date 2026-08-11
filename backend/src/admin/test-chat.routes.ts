import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logger } from '../shared/logger.js';
import { BadRequestError, NotFoundError } from '../shared/http-errors.js';
import { requireAdmin } from './admin.auth.js';
import {
  findOrCreateContact,
  findContactByPhone,
  deleteContact,
} from '../crm/leads/contacts.repository.js';
import { findConversation } from '../agents/shared/agent.memory.pg.js';
import type { Conversation } from '../agents/shared/agent.memory.pg.js';
import type { ChatMessage } from '../agents/shared/agent.types.js';
import { clearChatHistory, getChatHistory } from '../agents/shared/agent.memory.redis.js';
import { clearBlock } from '../agents/shared/agent.pause.js';
import { routeAgent } from '../agents/router/agent.router.js';
import { runCommercialTurn } from '../agents/commercial/commercial.service.js';
import { runSupportTurn } from '../agents/support/support.service.js';
import { fractureMessage } from '../agents/shared/agent.fracture.js';
import { isN8nTestConfigured, runN8nTestFlow } from '../testing/n8n-test-flow.js';
import {
  listNotes,
  upsertNote,
  deleteNote,
  deleteNotesOfSession,
  createSave,
  listSaves,
  findSave,
  deleteSave,
} from './test-console.repository.js';

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

const noteBodySchema = z.object({ note: z.string().min(1).max(2000) });
const saveBodySchema = z.object({ title: z.string().min(1).max(120) });

/** O contato de teste é um telefone sintético: nunca colide com número real da UAZAPI. */
function testPhone(sessionId: string): string {
  return `test-${sessionId}`;
}

function parseSessionId(request: FastifyRequest): string {
  const parsed = sessionIdSchema.safeParse((request.params as { sessionId?: string }).sessionId);
  if (!parsed.success) throw new BadRequestError('sessão inválida');
  return parsed.data;
}

function parseMessageIndex(request: FastifyRequest): number {
  const raw = (request.params as { messageIndex?: string }).messageIndex;
  const parsed = z.coerce.number().int().min(0).safeParse(raw);
  if (!parsed.success) throw new BadRequestError('índice de mensagem inválido');
  return parsed.data;
}

export interface TaggedMessage {
  index: number;
  role: 'user' | 'assistant';
  content: string;
  at: string | null;
  agentType: 'commercial' | 'support';
  note: string | null;
}

/**
 * Junta as conversas dos dois agentes numa linha do tempo só.
 *
 * `conversations` tem uma linha por `agent_type`, então uma conversa que passou
 * pelo comercial e pelo suporte vive partida em duas. A tela mostrava só a mais
 * recente — metade das mensagens sumia, e não dava pra ver o momento em que o
 * roteador trocou de agente, que é justamente o que se quer observar num teste.
 *
 * Empate de horário é a regra, não a exceção: `appendConversationTurn` grava a
 * mensagem do lead e a resposta com o mesmo timestamp. Por isso o desempate é a
 * posição original dentro da própria conversa.
 */
export function mergeConversations(conversations: Conversation[]): TaggedMessage[] {
  const flattened = conversations.flatMap((conversation) =>
    (conversation.messages ?? []).map((message: ChatMessage, position: number) => ({
      role: message.role,
      content: message.content,
      at: message.at ?? null,
      agentType: conversation.agent_type,
      position,
    })),
  );

  return flattened
    .sort((a, b) => {
      const timeA = a.at ? Date.parse(a.at) : 0;
      const timeB = b.at ? Date.parse(b.at) : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.position - b.position;
    })
    .map((message, index) => ({
      index,
      role: message.role,
      content: message.content,
      at: message.at,
      agentType: message.agentType,
      note: null,
    }));
}

/** Estado completo da sessão — usado pela tela e pelo snapshot, que precisam ser idênticos. */
async function buildSessionState(sessionId: string) {
  const contact = await findContactByPhone(testPhone(sessionId));

  const base = {
    viaN8n: isN8nTestConfigured(),
    messages: [] as TaggedMessage[],
    leadScore: 0,
    collectedData: {} as Record<string, unknown>,
    pausarIa: 'Não',
    conversationPhase: null as string | null,
  };

  if (!contact) return base;

  const [commercial, support, notes] = await Promise.all([
    findConversation(contact.id, 'commercial'),
    findConversation(contact.id, 'support'),
    listNotes(sessionId),
  ]);

  const conversations = [commercial, support].filter((item): item is Conversation => item !== null);
  if (conversations.length === 0) return { ...base, pausarIa: contact.pausar_ia };

  const noteByIndex = new Map(notes.map((note) => [note.message_index, note.note]));
  const messages = mergeConversations(conversations).map((message) => ({
    ...message,
    note: noteByIndex.get(message.index) ?? null,
  }));

  // Score e dados coletados são do comercial: o suporte não qualifica lead.
  // A fase também — só o agente comercial declara passo de roteiro.
  return {
    ...base,
    messages,
    leadScore: commercial?.lead_score ?? 0,
    collectedData: commercial?.collected_data ?? {},
    conversationPhase: commercial?.conversation_phase ?? null,
    pausarIa: contact.pausar_ia,
  };
}

export async function adminTestChatRoutes(app: FastifyInstance) {
  /** Estado da sessão: histórico dos dois agentes, score, dados coletados, fase e observações. */
  app.get('/api/v1/admin/test-chat/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdmin(request);
    const sessionId = parseSessionId(request);

    return reply.send(await buildSessionState(sessionId));
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
        conversationPhase: null,
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
      phase: turn.conversationPhase,
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
      conversationPhase: turn.conversationPhase,
      elapsedMs: Date.now() - startedAt,
    });
  });

  /** Zera a sessão: memória curta, bloqueio, contato, conversas e observações. */
  app.delete('/api/v1/admin/test-chat/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(request);
    const sessionId = parseSessionId(request);

    await clearChatHistory(TEST_INSTANCE, sessionId);
    await clearBlock(sessionId);
    // As observações apontam para índices de mensagem. Sem apagar junto, elas
    // reapareceriam grudadas nas mensagens da próxima conversa.
    await deleteNotesOfSession(sessionId);

    const contact = await findContactByPhone(testPhone(sessionId));
    if (contact) await deleteContact(contact.id);

    logger.info('test console session reset', { sessionId, by: user.email });
    return reply.send({ status: 'reset' });
  });

  // ---------- observações ----------

  app.put(
    '/api/v1/admin/test-chat/:sessionId/notes/:messageIndex',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await requireAdmin(request);
      const sessionId = parseSessionId(request);
      const messageIndex = parseMessageIndex(request);

      const parsed = noteBodySchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError('observação vazia ou longa demais');

      const note = await upsertNote(sessionId, messageIndex, parsed.data.note.trim(), user.email);
      return reply.send(note);
    },
  );

  app.delete(
    '/api/v1/admin/test-chat/:sessionId/notes/:messageIndex',
    async (request: FastifyRequest, reply: FastifyReply) => {
      await requireAdmin(request);
      const sessionId = parseSessionId(request);
      const messageIndex = parseMessageIndex(request);

      await deleteNote(sessionId, messageIndex);
      return reply.send({ status: 'deleted' });
    },
  );

  // ---------- conversas salvas ----------

  /** Congela a sessão atual. Ver comentário da tabela: é cópia, não referência. */
  app.post('/api/v1/admin/test-chat/:sessionId/save', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(request);
    const sessionId = parseSessionId(request);

    const parsed = saveBodySchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError('título obrigatório (até 120 caracteres)');

    const state = await buildSessionState(sessionId);
    if (state.messages.length === 0) throw new BadRequestError('conversa vazia, nada a salvar');

    const saved = await createSave(sessionId, parsed.data.title.trim(), state, user.email);
    logger.info('test conversation saved', { sessionId, saveId: saved.id, by: user.email });

    return reply.send(saved);
  });
}

/**
 * Prefixo próprio (`test-saves`, não `test-chat/...`) porque a lista não
 * pertence a nenhuma sessão: ela cruza todas.
 */
export async function adminTestSaveRoutes(app: FastifyInstance) {
  app.get('/api/v1/admin/test-saves', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdmin(request);
    return reply.send({ saves: await listSaves() });
  });

  app.get('/api/v1/admin/test-saves/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdmin(request);

    const parsed = z.string().uuid().safeParse((request.params as { id?: string }).id);
    if (!parsed.success) throw new BadRequestError('id inválido');

    const save = await findSave(parsed.data);
    if (!save) throw new NotFoundError('conversa salva não encontrada');

    return reply.send(save);
  });

  app.delete('/api/v1/admin/test-saves/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAdmin(request);

    const parsed = z.string().uuid().safeParse((request.params as { id?: string }).id);
    if (!parsed.success) throw new BadRequestError('id inválido');

    await deleteSave(parsed.data);
    logger.info('test conversation save deleted', { saveId: parsed.data, by: user.email });

    return reply.send({ status: 'deleted' });
  });
}
