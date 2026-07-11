import { routeAgent } from '../../src/agents/router/agent.router.js';
import type { Contact } from '../../src/crm/leads/contacts.repository.js';

const baseContact: Contact = {
  id: 'test-id',
  phone: '5511999999999',
  name: 'Teste',
  type: 'lead',
  pausar_ia: 'Não',
};

// CA-01: student -> support, no OpenAI call needed
const studentResult = await routeAgent({ ...baseContact, type: 'student' }, 'qualquer coisa');
console.log('student ->', studentResult, studentResult === 'support' ? 'PASS' : 'FAIL');

// CA-02/03 exercise the real OpenAI call (network required)
const commercialResult = await routeAgent(baseContact, 'oi, quanto custa o curso de inglês?');
console.log('commercial signal ->', commercialResult);

const supportResult = await routeAgent(baseContact, 'preciso remarcar minha aula de amanhã');
console.log('support signal ->', supportResult);
