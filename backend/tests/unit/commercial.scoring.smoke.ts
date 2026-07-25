import {
  scoreLead,
  shouldHandoff,
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
