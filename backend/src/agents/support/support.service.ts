import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { Contact } from '../../crm/leads/contacts.repository.js';
import type { SupportTurnResult } from '../shared/agent.types.js';
import { getChatHistory, appendChatMessage } from '../shared/agent.memory.redis.js';
import { getOrCreateConversation, appendConversationTurn } from '../shared/agent.memory.pg.js';
import { buildMessages } from '../shared/agent.context.js';
import { supportTurnSchema, supportResponseJsonSchema } from './support.schema.js';
import type { EscalationReason } from './support.schema.js';
import { retrieveKnowledgeContext } from '../../knowledge/knowledge.retrieval.js';
import { sanitizeOutgoingText } from '../../shared/text-sanitizer.js';
import { notifyGi } from '../shared/agent.handoff.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROMPT_PATH = resolve(__dirname, '../../../../agents/support/prompt-v1.md');
const SYSTEM_PROMPT = readFileSync(PROMPT_PATH, 'utf-8');

function buildSystemPrompt(knowledgeContext: string): string {
  if (!knowledgeContext) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\nCONTEXTO RELEVANTE (base de conhecimento da Results — use pra responder com precisão, nunca invente política fora disso):\n${knowledgeContext}`;
}

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
  const messages = buildMessages(buildSystemPrompt(knowledgeContext), history, message);
  const conversation = await getOrCreateConversation(contact.id, 'support');

  let reply: string;
  let handoff = false;
  let escalationReason: EscalationReason | null = null;

  try {
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL_SUPPORT,
      messages,
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
    await notifyGi(contact.id, contact.phone, ESCALATION_LABELS[escalationReason ?? 'outro'], reply);
  }

  return { reply, handoff, escalationReason };
}
