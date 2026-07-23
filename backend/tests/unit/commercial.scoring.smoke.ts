import { scoreLead, shouldHandoff } from '../../src/agents/commercial/commercial.scoring.js';
import type { CommercialCollectedData } from '../../src/agents/commercial/commercial.schema.js';

function check(label: string, actual: unknown, expected: unknown) {
  const pass = actual === expected;
  console.log(`${label}: ${actual} (expected ${expected}) ${pass ? 'PASS' : 'FAIL'}`);
}

const empty: CommercialCollectedData = {
  interested_course: null,
  availability: null,
  objective: null,
  urgency: null,
  has_tried_before: null,
  price_asked: null,
  wants_to_schedule: null,
  lead_source: null,
};

check('empty data, 1 message', scoreLead(empty, 1), 0);

const partial: CommercialCollectedData = {
  ...empty,
  interested_course: 'inglês business',
  availability: 'manhãs',
};
check('course+availability, 1 message', scoreLead(partial, 1), 4);

const full: CommercialCollectedData = {
  interested_course: 'inglês business',
  availability: 'manhãs',
  objective: 'promoção no trabalho',
  urgency: 'alta',
  has_tried_before: true,
  price_asked: true,
  wants_to_schedule: null,
  lead_source: 'Instagram',
};
check('all fields, 5 messages', scoreLead(full, 5), 10);
check('all fields, 5 messages -> handoff', shouldHandoff(scoreLead(full, 5), full), true);

check('empty data -> no handoff', shouldHandoff(scoreLead(empty, 1), empty), false);

// exactly at threshold: course+availability+objective = 6, +urgency alta = 7
const threshold: CommercialCollectedData = {
  ...empty,
  interested_course: 'x',
  availability: 'x',
  objective: 'x',
  urgency: 'alta',
};
check('threshold exactly 7 -> handoff', shouldHandoff(scoreLead(threshold, 1), threshold), true);
check('score capped at 10', scoreLead(full, 100), 10);

// wants_to_schedule força handoff mesmo com score baixo (não existe
// integração de calendário real — ver docs/specs/2026-07-23-m1-...)
const wantsScheduleLowScore: CommercialCollectedData = {
  ...empty,
  wants_to_schedule: true,
};
check('score low, wants_to_schedule=true', scoreLead(wantsScheduleLowScore, 1), 0);
check(
  'wants_to_schedule=true -> handoff regardless of score',
  shouldHandoff(scoreLead(wantsScheduleLowScore, 1), wantsScheduleLowScore),
  true,
);
