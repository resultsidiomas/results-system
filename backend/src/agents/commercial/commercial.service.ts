import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { Contact } from '../../crm/leads/contacts.repository.js';
import type { AgentTurnResult } from '../shared/agent.types.js';
import { getChatHistory, appendChatMessage } from '../shared/agent.memory.redis.js';
import { getOrCreateConversation, appendConversationTurn } from '../shared/agent.memory.pg.js';
import { buildMessages } from '../shared/agent.context.js';
import { commercialTurnSchema, commercialResponseJsonSchema } from './commercial.schema.js';
import { scoreLead, shouldHandoff } from './commercial.scoring.js';
import { handoffToGi } from './commercial.handoff.js';

const SYSTEM_PROMPT = `Você é um assistente de atendimento da Results Idiomas, uma escola de idiomas.
Seu objetivo é qualificar leads interessados em cursos de idiomas.
Seja cordial, objetivo e profissional.
Colete ao longo da conversa: curso de interesse, disponibilidade de horário, objetivo do aluno.
Responda sempre com o objeto estruturado pedido — nunca texto solto fora do schema.`;

const FALLBACK_REPLY =
  'Desculpa, tive um problema técnico aqui. Já vou repassar sua mensagem pra nossa equipe te responder, tá?';

export async function runCommercialTurn(
  contact: Contact,
  instance: string,
  remoteJid: string,
  message: string,
): Promise<AgentTurnResult> {
  const history = await getChatHistory(instance, remoteJid);
  const messages = buildMessages(SYSTEM_PROMPT, history, message);
  const conversation = await getOrCreateConversation(contact.id, 'commercial');

  let reply: string;
  let leadScore: number;

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
    reply = turn.reply;

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

  if (shouldHandoff(leadScore)) {
    await handoffToGi(contact.id, contact.phone, reply);
  }

  return { reply, leadScore };
}
