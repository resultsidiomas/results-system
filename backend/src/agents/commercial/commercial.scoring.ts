import type { CommercialCollectedData } from './commercial.schema.js';
import type { HandoffAlertKind } from '../shared/agent.handoff.js';

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
  /**
   * Categoria do alerta, usada pro teto de repetição (`claimHandoffAlert`).
   * Alerta que não pausa precisa de freio próprio: os campos que o disparam
   * ficam `true` pro resto da conversa e re-alertariam a cada mensagem.
   */
  alertKind: HandoffAlertKind | null;
}

const NO_HANDOFF: HandoffDecision = {
  handoff: false,
  pauseAi: false,
  reason: '',
  alertKind: null,
};

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
 * Lead aceitou **explicitamente** falar com uma pessoa da equipe: disse sim ao
 * convite (`accepted_consultant`) ou pediu atendimento humano por conta própria
 * (`needs_human`).
 *
 * `wants_to_schedule` é tratado à parte (ver `decideHandoff`): também pausa,
 * mas por outro motivo — quem marca aula é pessoa, não a IA.
 */
export function acceptedConsultant(data: CommercialCollectedData): boolean {
  return data.accepted_consultant === true || data.needs_human === true;
}

/**
 * Separa "avisar a Gi" de "calar a IA" — antes era a mesma coisa, e como não
 * existe rotina de resume, todo handoff virava silêncio permanente pro contato.
 *
 * **Pausa (1 dia, `AGENT_PAUSE_MAX_HOURS`) exige as duas condições juntas:**
 * lead **qualificado** (idioma + objetivo) **e** **aceitação explícita** de
 * falar com um consultor — regra definida pelo usuário em 2026-07-25. Aí sim a
 * conversa é da pessoa, não da IA.
 *
 * **Aceitar a aula experimental também pausa** (`wants_to_schedule`), por
 * decisão do usuário em 2026-08-10, revertendo a regra de 2026-07-25. O motivo
 * é o erro observado na revisão de conversa real: a IA seguia conduzindo o
 * agendamento sozinha e acabava oferecendo dia e hora que não existem, porque
 * não há integração de calendário. Quem confirma horário é pessoa. Então, no
 * momento em que o lead topa a experimental, a IA avisa que vai encaminhar,
 * sai da conversa e o contato vai pro mesmo destino do lead qualificado
 * (`GI_ALERT_NUMBER`, ver `agent.handoff.ts`).
 *
 * O risco conhecido dessa regra é marcar `wants_to_schedule` por sinal
 * implícito — na simulação de julho bastou o lead dizer "de manhã seria melhor
 * pra mim" pra virar `true`, e aí a IA emudeceria no meio da qualificação. A
 * contenção está no prompt (`commercial/prompt-v1.md` passo 5 e a definição do
 * campo em `collected_data`), que agora exige aceitação explícita e proíbe
 * marcar o campo por preferência de turno. Se voltar a acontecer, o ajuste é
 * no texto do campo, não aqui.
 *
 * Todo o resto avisa a Gi e a IA **continua respondendo**:
 * - aceitou consultor mas ainda não está qualificado: a IA segue conversando e
 *   completando idioma/objetivo em vez de entregar lead cru pra equipe.
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
      alertKind: 'turn_failed',
    };
  }

  if (acceptedConsultant(data)) {
    const qualified = isQualifiedLead(data);
    const reason = data.needs_human === true
      ? 'Lead pediu atendimento humano!'
      : 'Lead aceitou falar com um consultor!';

    return {
      handoff: true,
      pauseAi: qualified,
      reason: qualified ? reason : `${reason} (ainda sem idioma/objetivo — IA segue qualificando)`,
      alertKind: qualified ? null : 'accepted_consultant',
    };
  }

  if (data.wants_to_schedule === true) {
    return {
      handoff: true,
      pauseAi: true,
      reason: 'Lead aceitou a aula experimental — precisa de agendamento humano!',
      // Pausa é o próprio freio de repetição: o contato sai da IA, então não
      // existe turno seguinte pra re-alertar (mesma lógica de
      // `accepted_consultant` qualificado).
      alertKind: null,
    };
  }

  if (score >= HANDOFF_SCORE_THRESHOLD) {
    return { handoff: true, pauseAi: false, reason: 'Lead quente!', alertKind: 'hot_lead' };
  }

  return NO_HANDOFF;
}
