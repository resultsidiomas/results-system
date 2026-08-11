import { mergeConversations } from '../../src/admin/test-chat.routes.js';
import type { Conversation } from '../../src/agents/shared/agent.memory.pg.js';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${pass ? 'PASS' : 'FAIL'}`,
  );
}

function conversation(
  agentType: 'commercial' | 'support',
  messages: Array<{ role: 'user' | 'assistant'; content: string; at: string }>,
): Conversation {
  return {
    id: `id-${agentType}`,
    contact_id: 'contact-1',
    agent_type: agentType,
    messages,
    lead_score: 0,
    collected_data: {},
    stage: 'novo_lead',
    conversation_phase: null,
    updated_at: '2026-08-10T12:00:00.000Z',
  };
}

// O caso que motivou a função: conversa que passou pelos dois agentes vive em
// duas linhas do banco, e a tela mostrava só uma delas.
const commercial = conversation('commercial', [
  { role: 'user', content: 'quero fazer inglês', at: '2026-08-10T12:00:00.000Z' },
  { role: 'assistant', content: 'que ótimo!', at: '2026-08-10T12:00:00.000Z' },
]);

const support = conversation('support', [
  { role: 'user', content: 'preciso remarcar minha aula', at: '2026-08-10T12:05:00.000Z' },
  { role: 'assistant', content: 'claro, vou verificar', at: '2026-08-10T12:05:00.000Z' },
]);

const merged = mergeConversations([commercial, support]);

check('nenhuma mensagem se perde', merged.length, 4);

check(
  'ordem cronológica entre agentes',
  merged.map((message) => message.content),
  ['quero fazer inglês', 'que ótimo!', 'preciso remarcar minha aula', 'claro, vou verificar'],
);

check(
  'cada mensagem carrega o agente que a tratou',
  merged.map((message) => message.agentType),
  ['commercial', 'commercial', 'support', 'support'],
);

check(
  'índice é sequencial e serve de âncora pra observação',
  merged.map((message) => message.index),
  [0, 1, 2, 3],
);

// `appendConversationTurn` grava pergunta e resposta com o mesmo timestamp:
// sem desempate por posição, a resposta podia aparecer antes da pergunta.
check(
  'empate de horário mantém pergunta antes da resposta',
  merged.slice(0, 2).map((message) => message.role),
  ['user', 'assistant'],
);

// Ordem de entrada invertida não pode mudar o resultado.
check(
  'resultado independe da ordem das conversas recebidas',
  mergeConversations([support, commercial]).map((message) => message.content),
  merged.map((message) => message.content),
);

// Conversa só de um agente continua funcionando.
check('conversa de um agente só', mergeConversations([commercial]).length, 2);

check('nenhuma conversa devolve lista vazia', mergeConversations([]).length, 0);

// Linha antiga sem `at` não pode derrubar a ordenação.
const legacy = conversation('commercial', [
  { role: 'user', content: 'sem timestamp' } as never,
  { role: 'assistant', content: 'resposta sem timestamp' } as never,
]);

check(
  'mensagem sem horário não quebra a ordem',
  mergeConversations([legacy]).map((message) => message.content),
  ['sem timestamp', 'resposta sem timestamp'],
);

console.log(failures === 0 ? '\nall pass' : `\n${failures} fail`);
process.exit(failures === 0 ? 0 : 1);
