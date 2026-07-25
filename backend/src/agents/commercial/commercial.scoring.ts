import type { CommercialCollectedData } from './commercial.schema.js';

/**
 * Antes era 7, e isso emudecia a IA no meio da qualificação: idioma(2) +
 * disponibilidade(2) + objetivo(2) + conversa passando de 3 mensagens(1) já
 * dava 7 — handoff disparava e `pausar_ia` ia pra 'Sim' ANTES de o agente
 * explicar o método, mandar a tabela e convidar pra experimental, que é o
 * objetivo dele. Com 9, o agente tem espaço pra rodar o fluxo até o fim; lead
 * que topa agendar continua indo pra Gi na hora por `wants_to_schedule`.
 */
export const HANDOFF_SCORE_THRESHOLD = 9;

export function scoreLead(data: CommercialCollectedData, messageCount: number): number {
  let score = 0;
  if (data.interested_course) score += 2;
  if (data.availability) score += 2;
  if (data.objective) score += 2;
  if (data.urgency === 'alta') score += 1;
  if (data.has_tried_before) score += 1;
  if (messageCount > 3) score += 1;
  if (data.price_asked) score += 1;
  return Math.min(score, 10);
}

/**
 * `wants_to_schedule` e `needs_human` disparam handoff independente do score —
 * só um humano confirma horário real, e pedido explícito de atendente /
 * negociação fora da tabela nunca é a IA que resolve (ver handoff-rules.md).
 */
export function shouldHandoff(score: number, data: CommercialCollectedData): boolean {
  return (
    score >= HANDOFF_SCORE_THRESHOLD ||
    data.wants_to_schedule === true ||
    data.needs_human === true
  );
}
