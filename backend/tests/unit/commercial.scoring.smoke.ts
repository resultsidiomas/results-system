import {
  scoreLead,
  shouldHandoff,
  decideHandoff,
  isQualifiedLead,
  canSendPriceTable,
  HANDOFF_SCORE_THRESHOLD,
} from '../../src/agents/commercial/commercial.scoring.js';
import {
  EMPTY_COLLECTED_DATA,
  mergeCollectedData,
} from '../../src/agents/commercial/commercial.schema.js';
import type { CommercialCollectedData } from '../../src/agents/commercial/commercial.schema.js';

function check(label: string, actual: unknown, expected: unknown) {
  const pass = actual === expected;
  console.log(`${label}: ${actual} (expected ${expected}) ${pass ? 'PASS' : 'FAIL'}`);
}

const empty = EMPTY_COLLECTED_DATA;

check('empty data, 1 message', scoreLead(empty, 1), 0);

const partial: CommercialCollectedData = {
  ...empty,
  interested_course: 'inglês business',
  availability: 'manhãs',
};
check('course+availability, 1 message', scoreLead(partial, 1), 4);

const full: CommercialCollectedData = {
  ...empty,
  interested_course: 'inglês business',
  availability: 'manhãs',
  objective: 'promoção no trabalho',
  urgency: 'alta',
  has_tried_before: true,
  price_asked: true,
  lead_source: 'Instagram',
};
check('all fields, 5 messages', scoreLead(full, 5), 10);
check('all fields, 5 messages -> handoff', shouldHandoff(scoreLead(full, 5), full), true);
check('score capped at 10', scoreLead(full, 100), 10);

check('empty data -> no handoff', shouldHandoff(scoreLead(empty, 1), empty), false);

// Score 7 NÃO deve mais escalar: o agente precisa desse espaço pra explicar o
// método, mandar a tabela e convidar pra experimental antes de sair de cena.
const qualifiedNotDoneYet: CommercialCollectedData = {
  ...empty,
  interested_course: 'x',
  availability: 'x',
  objective: 'x',
  urgency: 'alta',
};
check('score 7 (qualificado, fluxo em andamento)', scoreLead(qualifiedNotDoneYet, 1), 7);
check(
  'score 7 -> NÃO escala (limite agora é 9)',
  shouldHandoff(scoreLead(qualifiedNotDoneYet, 1), qualifiedNotDoneYet),
  false,
);

const atThreshold: CommercialCollectedData = {
  ...qualifiedNotDoneYet,
  has_tried_before: true,
  price_asked: true,
};
check(`score exatamente ${HANDOFF_SCORE_THRESHOLD}`, scoreLead(atThreshold, 1), 9);
check('score 9 -> handoff', shouldHandoff(scoreLead(atThreshold, 1), atThreshold), true);

// wants_to_schedule força handoff mesmo com score baixo (não existe
// integração de calendário real — ver docs/specs/2026-07-23-m1-...)
const wantsScheduleLowScore: CommercialCollectedData = { ...empty, wants_to_schedule: true };
check('score low, wants_to_schedule=true', scoreLead(wantsScheduleLowScore, 1), 0);
check(
  'wants_to_schedule=true -> handoff regardless of score',
  shouldHandoff(scoreLead(wantsScheduleLowScore, 1), wantsScheduleLowScore),
  true,
);

// needs_human: lead pede atendente / desconto fora da tabela / reclama.
const needsHumanLowScore: CommercialCollectedData = { ...empty, needs_human: true };
check(
  'needs_human=true -> handoff regardless of score',
  shouldHandoff(scoreLead(needsHumanLowScore, 1), needsHumanLowScore),
  true,
);

// mergeCollectedData: null do turno novo nunca apaga dado já coletado.
const previous = { interested_course: 'inglês', objective: 'viagem', price_asked: true };
const forgetful: CommercialCollectedData = { ...empty, availability: 'noites' };
const merged = mergeCollectedData(previous, forgetful);
check('merge mantém interested_course antigo', merged.interested_course, 'inglês');
check('merge mantém objective antigo', merged.objective, 'viagem');
check('merge adiciona availability novo', merged.availability, 'noites');
check('merge trava price_asked em true', merged.price_asked, true);
check('merge preserva score acumulado', scoreLead(merged, 1), 7);

// Latch: flag que já foi true não volta pra false num turno seguinte.
const latched = mergeCollectedData(
  { wants_to_schedule: true },
  { ...empty, wants_to_schedule: false },
);
check('wants_to_schedule não desliga', latched.wants_to_schedule, true);

// Campo não-latch pode ser atualizado por valor novo.
const updated = mergeCollectedData({ availability: 'manhãs' }, { ...empty, availability: 'noites' });
check('availability atualiza pro valor novo', updated.availability, 'noites');

// decideHandoff: "avisar a Gi" deixou de ser a mesma coisa que "calar a IA".
// A IA só sai da conversa com lead QUALIFICADO (idioma + objetivo) que ACEITOU
// falar com um consultor — decisão do usuário, 2026-07-25 (ADR-014).
const qualificado: CommercialCollectedData = {
  ...empty,
  interested_course: 'inglês',
  objective: 'trabalho',
};

check('qualificado = idioma + objetivo', isQualifiedLead(qualificado), true);
check('só idioma não qualifica', isQualifiedLead({ ...empty, interested_course: 'inglês' }), false);
check('só objetivo não qualifica', isQualifiedLead({ ...empty, objective: 'viagem' }), false);

const failed = decideHandoff(0, empty, true);
check('falha técnica avisa a Gi', failed.handoff, true);
check('falha técnica NÃO pausa a IA', failed.pauseAi, false);

const hot = decideHandoff(HANDOFF_SCORE_THRESHOLD, atThreshold, false);
check('score alto avisa a Gi', hot.handoff, true);
check('score alto NÃO pausa a IA', hot.pauseAi, false);

const aceitouQualificado = decideHandoff(6, { ...qualificado, accepted_consultant: true }, false);
check('qualificado + aceitou consultor avisa a Gi', aceitouQualificado.handoff, true);
check('qualificado + aceitou consultor PAUSA a IA', aceitouQualificado.pauseAi, true);
check('motivo do consultor', aceitouQualificado.reason, 'Lead aceitou falar com um consultor!');

// Aceitou antes de qualificar: avisa, mas a IA fica pra fechar idioma/objetivo.
const aceitouCru = decideHandoff(0, { ...empty, accepted_consultant: true }, false);
check('aceitou sem qualificar avisa a Gi', aceitouCru.handoff, true);
check('aceitou sem qualificar NÃO pausa a IA', aceitouCru.pauseAi, false);

const wantsSchedule = decideHandoff(0, { ...qualificado, wants_to_schedule: true }, false);
check('quer agendar (qualificado) avisa a Gi', wantsSchedule.handoff, true);
check('quer agendar (qualificado) pausa a IA', wantsSchedule.pauseAi, true);
check('motivo do agendamento', wantsSchedule.reason, 'Lead quer agendar aula experimental!');

const wantsScheduleCru = decideHandoff(0, { ...empty, wants_to_schedule: true }, false);
check('quer agendar sem qualificar NÃO pausa', wantsScheduleCru.pauseAi, false);

const needsHuman = decideHandoff(0, { ...qualificado, needs_human: true }, false);
check('pediu humano (qualificado) pausa a IA', needsHuman.pauseAi, true);
check('motivo do pedido de humano', needsHuman.reason, 'Lead pediu atendimento humano!');

const cold = decideHandoff(4, partial, false);
check('lead frio não gera handoff', cold.handoff, false);
check('lead frio não pausa a IA', cold.pauseAi, false);

// Falha técnica tem prioridade sobre o resto: o fallback prometeu resposta
// humana, mas o próximo turno pode funcionar — não pausa.
const failedWhileHot = decideHandoff(10, { ...qualificado, wants_to_schedule: true }, true);
check('falha técnica prevalece e não pausa', failedWhileHot.pauseAi, false);

// Tabela de preço: o modelo querendo mandar não basta, o lead tem que ter
// pedido preço. Modelo confundia "prefiro aula particular" com pedido de preço.
check(
  'modelo quer mandar + lead pediu preço → manda',
  canSendPriceTable(true, { ...qualificado, price_asked: true }),
  true,
);
check(
  'modelo quer mandar + lead NÃO pediu preço → suprime',
  canSendPriceTable(true, qualificado),
  false,
);
check('modelo não quer mandar → não manda', canSendPriceTable(false, { ...qualificado, price_asked: true }), false);
// price_asked é trava acumulada: pedido em turno anterior continua valendo.
check(
  'preço pedido em turno anterior ainda libera',
  canSendPriceTable(true, mergeCollectedData({ price_asked: true }, qualificado)),
  true,
);

// Trava: aceitação não pode ser desligada num turno em que o modelo a omite.
const latchedAccept = mergeCollectedData(
  { accepted_consultant: true },
  { ...empty, accepted_consultant: null },
);
check('accepted_consultant não desliga', latchedAccept.accepted_consultant, true);
