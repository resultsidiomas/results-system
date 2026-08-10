import { emojiBudget } from '../../src/agents/shared/agent.emoji-budget.js';
import { sanitizeOutgoingText } from '../../src/shared/text-sanitizer.js';
import type { ChatMessage } from '../../src/agents/shared/agent.types.js';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(`${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${pass ? 'PASS' : 'FAIL'}`);
}

const at = '2026-08-10T12:00:00.000Z';
const user = (content: string): ChatMessage => ({ role: 'user', content, at });
const assistant = (content: string): ChatMessage => ({ role: 'assistant', content, at });

// Regra do usuário: emoji só na primeira e na última mensagem do atendimento.
check('conversa nova libera emoji', emojiBudget({ history: [], isClosingTurn: false }), 1);

check(
  'primeira resposta libera mesmo com mensagem do lead antes',
  emojiBudget({ history: [user('oi, quero fazer inglês')], isClosingTurn: false }),
  1,
);

check(
  'meio da conversa não leva emoji',
  emojiBudget({ history: [user('oi'), assistant('Oi! Tudo bem?')], isClosingTurn: false }),
  0,
);

check(
  'turno que encerra o atendimento libera emoji',
  emojiBudget({ history: [user('oi'), assistant('Oi!'), user('quero agendar')], isClosingTurn: true }),
  1,
);

// O corte é determinístico no sanitizer — instrução de prompt sozinha já falhou
// nessa exata regra antes.
const meio = emojiBudget({ history: [user('oi'), assistant('Oi!')], isClosingTurn: false });
check(
  'emoji do meio é removido de fato',
  sanitizeOutgoingText('Que ótimo saber disso! 😊', meio),
  'Que ótimo saber disso!',
);

const abertura = emojiBudget({ history: [], isClosingTurn: false });
check(
  'emoji da abertura sobrevive',
  sanitizeOutgoingText('Oi! Tudo bem? 😊', abertura),
  'Oi! Tudo bem? 😊',
);

check(
  'só um emoji mesmo no turno permitido',
  sanitizeOutgoingText('Perfeito! 😊 Já encaminhei 🎉', abertura),
  'Perfeito! 😊 Já encaminhei',
);

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
