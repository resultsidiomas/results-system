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

/**
 * A tabela de preço só sai se o lead **pediu preço** (`price_asked`, trava
 * acumulada da conversa) — o modelo pedir não basta.
 *
 * Mandar proposta antes de o lead pedir atropela a etapa de conexão, onde o
 * método é explicado e o valor construído. Mesmo com a regra explícita no
 * prompt (`prompt-v1.md` passo 4, linha 1 do algoritmo), o modelo confundia
 * "prefiro aula particular" com pedido de preço em cerca de 1 de cada 3
 * conversas de teste. Aqui a condição é garantida.
 */
export function canSendPriceTable(
  modelWantsToSend: boolean,
  data: CommercialCollectedData,
): boolean {
  return modelWantsToSend && data.price_asked === true;
}

export interface HandoffDecision {
  /** Avisar a Gi neste turno. */
  handoff: boolean;
  /** Gravar `pausar_ia='Sim'` (IA sai da conversa até intervenção humana). */
  pauseAi: boolean;
  reason: string;
}

const NO_HANDOFF: HandoffDecision = { handoff: false, pauseAi: false, reason: '' };

/**
 * Lead qualificado = núcleo da qualificação fechado (idioma + objetivo).
 *
 * Mesmo gate que libera a tabela de preço (`prompt-v1.md` passo 4): é o ponto
 * em que a equipe consegue atender sabendo o que o lead quer e por quê.
 * Deliberadamente não usa score: score sobe por sinal lateral (mais de 3
 * mensagens, já tentou antes) e "qualificado" aqui precisa significar dado de
 * negócio presente, não temperatura.
 */
export function isQualifiedLead(data: CommercialCollectedData): boolean {
  return Boolean(data.interested_course && data.objective);
}

/**
 * Lead aceitou (ou pediu) falar com uma pessoa da equipe.
 *
 * Três formas da mesma coisa: disse sim ao convite pra falar com um consultor,
 * pediu atendimento humano por conta própria, ou topou a aula experimental —
 * que é um consultor quem fecha, já que não existe integração de calendário.
 */
export function acceptedConsultant(data: CommercialCollectedData): boolean {
  return (
    data.accepted_consultant === true ||
    data.needs_human === true ||
    data.wants_to_schedule === true
  );
}

/**
 * Separa "avisar a Gi" de "calar a IA" — antes era a mesma coisa, e como não
 * existe rotina de resume, todo handoff virava silêncio permanente pro contato.
 *
 * **Pausa (1 dia, `AGENT_PAUSE_MAX_HOURS`) exige as duas condições juntas:**
 * lead **qualificado** (idioma + objetivo) **e** **aceitou falar com um
 * consultor** — regra definida pelo usuário em 2026-07-25. Aí sim a conversa é
 * da pessoa, não da IA.
 *
 * Todo o resto avisa a Gi e a IA **continua respondendo**:
 * - aceitou consultor mas ainda não está qualificado: a IA segue conversando e
 *   completando idioma/objetivo em vez de deixar o lead no vácuo.
 * - score ≥ 9: inferência de temperatura, não pedido do lead. Pausar aqui
 *   emudecia a IA no meio da qualificação.
 * - falha técnica: o fallback promete resposta humana (então avisa), mas o
 *   próximo turno pode funcionar — pausar por causa de um 429 da OpenAI
 *   deixava o contato mudo pra sempre.
 */
export function decideHandoff(
  score: number,
  data: CommercialCollectedData,
  turnFailed: boolean,
): HandoffDecision {
  if (turnFailed) {
    return {
      handoff: true,
      pauseAi: false,
      reason: 'Falha técnica no agente — lead precisa de resposta humana!',
    };
  }

  const accepted = acceptedConsultant(data);

  if (accepted && isQualifiedLead(data)) {
    return { handoff: true, pauseAi: true, reason: acceptedReason(data) };
  }

  if (accepted) {
    return {
      handoff: true,
      pauseAi: false,
      reason: `${acceptedReason(data)} (ainda sem idioma/objetivo — IA segue qualificando)`,
    };
  }

  if (score >= HANDOFF_SCORE_THRESHOLD) {
    return { handoff: true, pauseAi: false, reason: 'Lead quente!' };
  }

  return NO_HANDOFF;
}

function acceptedReason(data: CommercialCollectedData): string {
  if (data.wants_to_schedule === true) return 'Lead quer agendar aula experimental!';
  if (data.needs_human === true) return 'Lead pediu atendimento humano!';
  return 'Lead aceitou falar com um consultor!';
}
