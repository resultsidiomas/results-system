import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { Contact } from '../../crm/leads/contacts.repository.js';
import type { AgentTurnResult } from '../shared/agent.types.js';
import { getChatHistory, appendChatMessage } from '../shared/agent.memory.redis.js';
import { getOrCreateConversation, appendConversationTurn } from '../shared/agent.memory.pg.js';
import { buildMessages, lastAssistantReply } from '../shared/agent.context.js';
import { composeSystemPrompt, withKnowledgeContext } from '../shared/agent.prompt.js';
import { completeStructuredTurn } from '../shared/agent.completion.js';
import { commercialTurnSchema, commercialResponseJsonSchema } from './commercial.schema.js';
import { EMPTY_COLLECTED_DATA, mergeCollectedData } from './commercial.schema.js';
import type { PriceTableVariant, CommercialCollectedData } from './commercial.schema.js';
import { scoreLead, decideHandoff, canSendPriceTable } from './commercial.scoring.js';
import { notifyGi, claimHandoffAlert } from '../shared/agent.handoff.js';
import { retrieveKnowledgeContext } from '../../knowledge/knowledge.retrieval.js';
import { sanitizeOutgoingText } from '../../shared/text-sanitizer.js';

/**
 * Regra de comportamento vai toda no system prompt — nunca como referência a
 * arquivo, que o modelo não consegue abrir (ver `agent.prompt.ts`).
 */
const SYSTEM_PROMPT = composeSystemPrompt([
  'commercial/prompt-v1.md',
  'shared/persona.md',
  'shared/forbidden-phrases.md',
  'shared/school-info.md',
  'commercial/objections.md',
  'commercial/handoff-rules.md',
]);

const KNOWLEDGE_GUARDRAIL =
  'use pra responder com precisão, nunca invente preço/curso/política fora disso';

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
  const systemPrompt = withKnowledgeContext(SYSTEM_PROMPT, knowledgeContext, KNOWLEDGE_GUARDRAIL);
  const messages = buildMessages(systemPrompt, history, message);
  const conversation = await getOrCreateConversation(contact.id, 'commercial');

  let reply: string;
  let leadScore: number;
  let sendPriceTable = false;
  let priceTableVariant: PriceTableVariant = 'geral';
  let collectedData: CommercialCollectedData = EMPTY_COLLECTED_DATA;
  let turnFailed = false;

  try {
    const turn = await completeStructuredTurn({
      label: 'commercial',
      model: env.OPENAI_MODEL_COMMERCIAL,
      messages,
      jsonSchema: commercialResponseJsonSchema,
      parse: (raw) => commercialTurnSchema.parse(raw),
      replyOf: (parsed) => parsed.reply,
      lastAssistantReply: lastAssistantReply(history),
    });

    const messageCount = conversation.messages.length + 2;
    // Score sobre o acumulado da conversa, não só sobre o turno atual: o modelo
    // omite campos já coletados em turnos seguintes, e pontuar o turno isolado
    // fazia o score cair e o handoff virar sorteio.
    collectedData = mergeCollectedData(conversation.collected_data, turn.collected_data);
    leadScore = scoreLead(collectedData, messageCount);
    reply = sanitizeOutgoingText(turn.reply);
    priceTableVariant = turn.price_table_variant;

    sendPriceTable = canSendPriceTable(turn.send_price_table, collectedData);

    if (turn.send_price_table && !sendPriceTable) {
      logger.warn('price table suppressed: lead has not asked about price yet', {
        contactId: contact.id,
      });
    }

    await appendConversationTurn(conversation, message, reply, leadScore, collectedData);
  } catch (err) {
    logger.error('commercial turn failed, using fallback reply', {
      errorMessage: (err as Error).message,
    });
    reply = FALLBACK_REPLY;
    leadScore = conversation.lead_score;
    collectedData = mergeCollectedData(conversation.collected_data, EMPTY_COLLECTED_DATA);
    turnFailed = true;
  }

  await appendChatMessage(instance, remoteJid, { role: 'user', content: message, at: new Date().toISOString() });
  await appendChatMessage(instance, remoteJid, { role: 'assistant', content: reply, at: new Date().toISOString() });

  // A resposta de fallback promete ao lead que a equipe vai responder — então
  // precisa gerar handoff de verdade. Antes o turno falhava, o lead recebia a
  // promessa e ninguém era avisado. `pauseAi` decide se a IA sai da conversa:
  // só pedido explícito cala o agente (ver `decideHandoff`).
  const decision = decideHandoff(leadScore, collectedData, turnFailed);

  if (decision.handoff && options.notifyHandoff !== false) {
    await alertGi(decision, contact, collectedData, leadScore, reply, turnFailed);
  }

  // Quem chama decide QUANDO entregar a tabela (imagem só pode ir depois do
  // texto ter sido enviado de verdade — ver ADR-012). Esta função só sinaliza.
  return {
    reply,
    leadScore,
    handoff: decision.handoff,
    pauseAi: decision.pauseAi,
    sendPriceTable,
    priceTableVariant,
  };
}

/**
 * Alerta pra Gi nunca derruba o turno: `notifyGi` faz update no Supabase e
 * manda WhatsApp, e qualquer um dos dois pode falhar. Como a chamada acontece
 * depois da resposta pronta, uma exceção aqui virava 500 no endpoint e o lead
 * ficava sem receber a resposta que já estava gerada.
 */
async function alertGi(
  decision: ReturnType<typeof decideHandoff>,
  contact: Contact,
  collectedData: CommercialCollectedData,
  leadScore: number,
  reply: string,
  turnFailed: boolean,
): Promise<void> {
  // Handoff que não pausa a IA repetiria o alerta a cada mensagem seguinte —
  // os campos que o disparam ficam `true` pro resto da conversa.
  if (decision.alertKind !== null && !(await claimHandoffAlert(contact.id, decision.alertKind))) {
    return;
  }

  try {
    await notifyGi(
      contact.id,
      contact.phone,
      decision.reason,
      reply,
      {
        Nome: collectedData.full_name ?? contact.name,
        'E-mail': collectedData.email,
        Idioma: collectedData.interested_course,
        Objetivo: collectedData.objective,
        Disponibilidade: collectedData.availability,
        Urgência: collectedData.urgency,
        Origem: collectedData.lead_source,
        Score: turnFailed ? null : leadScore,
      },
      { pauseAi: decision.pauseAi },
    );
  } catch (err) {
    logger.error('handoff alert failed, reply still delivered', {
      contactId: contact.id,
      errorMessage: (err as Error).message,
    });
  }
}
