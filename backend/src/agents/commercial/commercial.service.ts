import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { Contact } from '../../crm/leads/contacts.repository.js';
import type { AgentTurnResult } from '../shared/agent.types.js';
import { getChatHistory, appendChatMessage } from '../shared/agent.memory.redis.js';
import { getOrCreateConversation, appendConversationTurn } from '../shared/agent.memory.pg.js';
import { buildMessages } from '../shared/agent.context.js';
import { commercialTurnSchema, commercialResponseJsonSchema } from './commercial.schema.js';
import type { PriceTableVariant } from './commercial.schema.js';
import { scoreLead, shouldHandoff } from './commercial.scoring.js';
import { notifyGi } from '../shared/agent.handoff.js';
import { retrieveKnowledgeContext } from '../../knowledge/knowledge.retrieval.js';
import { sanitizeOutgoingText } from '../../shared/text-sanitizer.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROMPT_PATH = resolve(__dirname, '../../../../agents/commercial/prompt-v1.md');
const SYSTEM_PROMPT = readFileSync(PROMPT_PATH, 'utf-8');

function buildSystemPrompt(knowledgeContext: string): string {
  if (!knowledgeContext) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\nCONTEXTO RELEVANTE (base de conhecimento da Results — use pra responder com precisão, nunca invente preço/curso/política fora disso):\n${knowledgeContext}`;
}

const FALLBACK_REPLY =
  'Desculpa, tive um problema técnico aqui. Já vou repassar sua mensagem pra nossa equipe te responder, tá?';

export interface RunCommercialTurnOptions {
  /** false pro console de teste — evita alertar a Gi via WhatsApp real com dado fictício */
  notifyHandoff?: boolean;
}

export async function runCommercialTurn(
  contact: Contact,
  instance: string,
  remoteJid: string,
  message: string,
  options: RunCommercialTurnOptions = {},
): Promise<AgentTurnResult> {
  const history = await getChatHistory(instance, remoteJid);
  const knowledgeContext = await retrieveKnowledgeContext(message, 'commercial');
  const messages = buildMessages(buildSystemPrompt(knowledgeContext), history, message);
  const conversation = await getOrCreateConversation(contact.id, 'commercial');

  let reply: string;
  let leadScore: number;
  let sendPriceTable = false;
  let priceTableVariant: PriceTableVariant = 'geral';

  try {
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL_COMMERCIAL,
      messages,
      max_tokens: env.OPENAI_MAX_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: commercialResponseJsonSchema,
      },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const turn = commercialTurnSchema.parse(JSON.parse(raw));

    const messageCount = conversation.messages.length + 2;
    leadScore = scoreLead(turn.collected_data, messageCount);
    reply = sanitizeOutgoingText(turn.reply);
    sendPriceTable = turn.send_price_table;
    priceTableVariant = turn.price_table_variant;

    await appendConversationTurn(conversation, message, reply, leadScore, turn.collected_data);
  } catch (err) {
    logger.error('commercial turn failed, using fallback reply', {
      errorMessage: (err as Error).message,
    });
    reply = FALLBACK_REPLY;
    leadScore = conversation.lead_score;
  }

  await appendChatMessage(instance, remoteJid, { role: 'user', content: message, at: new Date().toISOString() });
  await appendChatMessage(instance, remoteJid, { role: 'assistant', content: reply, at: new Date().toISOString() });

  const handoff = shouldHandoff(leadScore);
  if (handoff && options.notifyHandoff !== false) {
    await notifyGi(contact.id, contact.phone, 'Lead quente!', reply);
  }

  // Quem chama decide QUANDO entregar a tabela (imagem só pode ir depois do
  // texto ter sido enviado de verdade — ver ADR-012). Esta função só sinaliza.
  return { reply, leadScore, handoff, sendPriceTable, priceTableVariant };
}
