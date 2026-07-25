import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { Contact } from '../../crm/leads/contacts.repository.js';
import type { SupportTurnResult } from '../shared/agent.types.js';
import { getChatHistory, appendChatMessage } from '../shared/agent.memory.redis.js';
import { getOrCreateConversation, appendConversationTurn } from '../shared/agent.memory.pg.js';
import { buildMessages } from '../shared/agent.context.js';
import { composeSystemPrompt, withKnowledgeContext } from '../shared/agent.prompt.js';
import { supportTurnSchema, supportResponseJsonSchema } from './support.schema.js';
import type { EscalationReason } from './support.schema.js';
import { retrieveKnowledgeContext } from '../../knowledge/knowledge.retrieval.js';
import { sanitizeOutgoingText } from '../../shared/text-sanitizer.js';
import { notifyGi } from '../shared/agent.handoff.js';

/**
 * Regra de comportamento vai toda no system prompt — nunca como referência a
 * arquivo, que o modelo não consegue abrir (ver `agent.prompt.ts`).
 */
const SYSTEM_PROMPT = composeSystemPrompt([
  'support/prompt-v1.md',
  'shared/persona.md',
  'shared/forbidden-phrases.md',
  'shared/school-info.md',
  'support/rescheduling-rules.md',
  'support/retention-flow.md',
  // FAQ vai no prompt, não na busca: é pequeno, é o assunto mais frequente do
  // suporte, e quando a recuperação falhava o agente inventava um fluxo de
  // "Esqueci minha senha" que não existe em vez de mandar o link real.
  'support/faq.md',
]);

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
  const systemPrompt = withKnowledgeContext(SYSTEM_PROMPT, knowledgeContext, KNOWLEDGE_GUARDRAIL);
  const messages = buildMessages(systemPrompt, history, message);
  const conversation = await getOrCreateConversation(contact.id, 'support');

  let reply: string;
  let handoff = false;
  let escalationReason: EscalationReason | null = null;

  try {
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL_SUPPORT,
      messages,
      temperature: env.AGENT_TEMPERATURE,
      max_tokens: env.OPENAI_MAX_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: supportResponseJsonSchema,
      },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const turn = supportTurnSchema.parse(JSON.parse(raw));

    reply = sanitizeOutgoingText(turn.reply);
    handoff = turn.needs_human;
    escalationReason = turn.escalation_reason;

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
  }

  await appendChatMessage(instance, remoteJid, { role: 'user', content: message, at: new Date().toISOString() });
  await appendChatMessage(instance, remoteJid, { role: 'assistant', content: reply, at: new Date().toISOString() });

  if (handoff && options.notifyHandoff !== false) {
    await notifyGi(contact.id, contact.phone, ESCALATION_LABELS[escalationReason ?? 'outro'], reply, {
      Nome: contact.name,
      Tipo: contact.type === 'student' ? 'aluno matriculado' : 'lead',
    });
  }

  return { reply, handoff, escalationReason };
}
