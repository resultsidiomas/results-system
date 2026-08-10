import { env } from '../../config/env.js';
import type { ChatMessage } from './agent.types.js';

/**
 * Quantos emojis a resposta deste turno pode levar.
 *
 * Regra do usuário (2026-08-10, a partir da revisão de conversa real): emoji
 * só na **primeira** e na **última** mensagem do atendimento, nunca no meio.
 * O limite anterior (`AGENT_MAX_EMOJIS`, 1 por resposta) permitia um emoji em
 * *toda* resposta, e era exatamente esse o efeito observado: emoji em quase
 * toda bolha, atendimento com cara de robô de marketing.
 *
 * "Última mensagem" não dá pra saber olhando só o texto — o modelo não conhece
 * o futuro da conversa. O que existe de concreto é o momento em que a IA sai
 * de cena: quando o turno pausa o atendimento e entrega pra uma pessoa
 * (`pauseAi`), aquela é, de fato, a última mensagem que a IA manda. É esse o
 * sinal usado aqui.
 *
 * Fora esses dois momentos o orçamento é zero, e o corte é determinístico no
 * sanitizer — regra de prompt sozinha já falhou nessa exata questão antes.
 */
export function emojiBudget(options: {
  /** Histórico da conversa ANTES deste turno. */
  history: readonly ChatMessage[];
  /** Este turno encerra o atendimento da IA (handoff com pausa). */
  isClosingTurn: boolean;
}): number {
  const allowance = env.AGENT_MAX_EMOJIS;
  if (allowance === 0) return 0;

  const isFirstAgentMessage = !options.history.some((message) => message.role === 'assistant');
  if (isFirstAgentMessage || options.isClosingTurn) return allowance;

  return 0;
}
