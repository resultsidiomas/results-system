import { routeAgent } from '../../src/agents/router/agent.router.js';
import type { Contact } from '../../src/crm/leads/contacts.repository.js';
import type { ChatMessage } from '../../src/agents/shared/agent.types.js';

// Todos os casos passam pelo classificador (OpenAI) — rede obrigatória.
// `contact.type === 'student'` não é mais atalho: virou só desempate de caso
// ambíguo, pra aluno matriculado poder comprar (upsell) sem ficar preso no
// suporte.

const baseContact: Contact = {
  id: 'test-id',
  phone: '5511999999999',
  name: 'Teste',
  type: 'lead',
  pausar_ia: 'Não',
};

const student: Contact = { ...baseContact, type: 'student' };

function turn(role: ChatMessage['role'], content: string): ChatMessage {
  return { role, content, at: new Date().toISOString() };
}

function check(label: string, actual: string, expected: string) {
  console.log(`${label}: ${actual} (expected ${expected}) ${actual === expected ? 'PASS' : 'FAIL'}`);
}

// Sinal claro de cada lado
check('lead pergunta preço', await routeAgent(baseContact, 'oi, quanto custa o curso de inglês?'), 'commercial');
check('lead quer remarcar', await routeAgent(baseContact, 'preciso remarcar minha aula de amanhã'), 'support');

// Aluno matriculado: suporte no caso genérico, comercial quando quer comprar
check('aluno com dúvida do app', await routeAgent(student, 'não consigo logar no Callan app'), 'support');
check('aluno quer 2º idioma (upsell)', await routeAgent(student, 'quero começar espanhol também, quanto fica?'), 'commercial');

// Mensagem curta no meio da qualificação não deve trocar de agente
const commercialHistory: ChatMessage[] = [
  turn('user', 'oi, queria saber do curso de inglês'),
  turn('assistant', 'Oi! Tudo bem? Como você prefere estudar, particular ou em turma?'),
  turn('user', 'particular'),
  turn('assistant', 'Perfeito. Você prefere de manhã, tarde ou noite?'),
];
check(
  'contexto comercial + "e o horário?"',
  await routeAgent(baseContact, 'e o horário?', commercialHistory),
  'commercial',
);
check('contexto comercial + "sim"', await routeAgent(baseContact, 'sim', commercialHistory), 'commercial');

// Mesma frase curta, contexto de suporte -> continua no suporte
const supportHistory: ChatMessage[] = [
  turn('user', 'minha aula de amanhã não vai dar, consigo remarcar?'),
  turn('assistant', 'Entendo! O reagendamento precisa de no mínimo 3 horas de antecedência.'),
];
check('contexto suporte + "sim"', await routeAgent(student, 'sim', supportHistory), 'support');
