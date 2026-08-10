import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { Contact } from '../../crm/leads/contacts.repository.js';
import type { SupportTurnResult } from '../shared/agent.types.js';
import { getChatHistory, appendChatMessage } from '../shared/agent.memory.redis.js';
import { getOrCreateConversation, appendConversationTurn } from '../shared/agent.memory.pg.js';
import { buildMessages, lastAssistantReply } from '../shared/agent.context.js';
import { completeStructuredTurn } from '../shared/agent.completion.js';
import { withKnowledgeContext } from '../shared/agent.prompt.js';
import { loadSystemPrompt } from '../shared/agent.prompt.repository.js';
import { emojiBudget } from '../shared/agent.emoji-budget.js';
import { supportTurnSchema, supportResponseJsonSchema } from './support.schema.js';
import type { EscalationReason } from './support.schema.js';
import { retrieveKnowledgeContext } from '../../knowledge/knowledge.retrieval.js';
import { sanitizeOutgoingText } from '../../shared/text-sanitizer.js';
import { notifyGi, claimHandoffAlert } from '../shared/agent.handoff.js';

const KNOWLEDGE_GUARDRAIL = 'use pra responder com precisão, nunca invente política fora disso';

const FALLBACK_REPLY =
  'Desculpa, tive um problema técnico aqui. Já vou repassar sua mensagem pra nossa equipe te responder, tá?';

const ESCALATION_LABELS: Record<EscalationReason, string> = {
  reagendamento: 'Aluno pediu reagendamento de aula',
  cancelamento: 'Aluno pediu cancelamento',
  falta_professor: 'Aviso de falta de professor',
  reclamacao: 'Reclamação de aluno',
  outro: 'Aluno precisa de atendimento humano',
};

export interface RunSupportTurnOptions {
  /** false pro console de teste — evita alertar a Gi via WhatsApp real com dado fictício */
  notifyHandoff?: boolean;
}

export async function runSupportTurn(
  contact: Contact,
  instance: string,
  remoteJid: string,
  message: string,
  options: RunSupportTurnOptions = {},
): Promise<SupportTurnResult> {
  const history = await getChatHistory(instance, remoteJid);
  const knowledgeContext = await retrieveKnowledgeContext(message, 'support');
  // Prompt vem do banco, com os `.md` do git como fallback — ver
  // `agent.prompt.repository.ts`.
  const basePrompt = await loadSystemPrompt('support');
  const systemPrompt = withKnowledgeContext(basePrompt, knowledgeContext, KNOWLEDGE_GUARDRAIL);
  const messages = buildMessages(systemPrompt, history, message);
  const conversation = await getOrCreateConversation(contact.id, 'support');

  let reply: string;
  let handoff = false;
  let escalationReason: EscalationReason | null = null;
  let turnFailed = false;

  try {
    const turn = await completeStructuredTurn({
      label: 'support',
      model: env.OPENAI_MODEL_SUPPORT,
      messages,
      jsonSchema: supportResponseJsonSchema,
      parse: (raw) => supportTurnSchema.parse(raw),
      replyOf: (parsed) => parsed.reply,
      lastAssistantReply: lastAssistantReply(history),
    });

    handoff = turn.needs_human;
    escalationReason = turn.escalation_reason;

    // Escalação encerra o atendimento da IA, então é a última mensagem dela —
    // único momento (junto com a primeira) em que emoji é permitido.
    reply = sanitizeOutgoingText(turn.reply, emojiBudget({ history, isClosingTurn: handoff }));

    await appendConversationTurn(conversation, message, reply, conversation.lead_score, {
      last_escalation_reason: escalationReason,
    });
  } catch (err) {
    logger.error('support turn failed, using fallback reply', {
      errorMessage: (err as Error).message,
    });
    reply = FALLBACK_REPLY;
    handoff = true;
    escalationReason = 'outro';
    turnFailed = true;
  }

  await appendChatMessage(instance, remoteJid, { role: 'user', content: message, at: new Date().toISOString() });
  await appendChatMessage(instance, remoteJid, { role: 'assistant', content: reply, at: new Date().toISOString() });

  // Escalação pedida de fato (reagendamento, cancelamento, reclamação) tira a
  // IA da conversa; falha técnica não — o próximo turno pode funcionar, e
  // pausar por causa de um 429 da OpenAI deixava o aluno mudo sem resume
  // nenhum (ver ADR-014).
  const pauseAi = handoff && !turnFailed;

  if (handoff && options.notifyHandoff !== false) {
    await alertGi(contact, escalationReason, reply, pauseAi, turnFailed);
  }

  return { reply, handoff, pauseAi, escalationReason };
}

/** Falha no alerta nunca derruba o turno — a resposta do aluno já está pronta. */
async function alertGi(
  contact: Contact,
  escalationReason: EscalationReason | null,
  reply: string,
  pauseAi: boolean,
  turnFailed: boolean,
): Promise<void> {
  if (!pauseAi && !(await claimHandoffAlert(contact.id, turnFailed ? 'turn_failed' : 'hot_lead'))) {
    return;
  }

  try {
    await notifyGi(
      contact.id,
      contact.phone,
      ESCALATION_LABELS[escalationReason ?? 'outro'],
      reply,
      {
        Nome: contact.name,
        Tipo: contact.type === 'student' ? 'aluno matriculado' : 'lead',
      },
      { pauseAi },
    );
  } catch (err) {
    logger.error('support handoff alert failed, reply still delivered', {
      contactId: contact.id,
      errorMessage: (err as Error).message,
    });
  }
}
