import type { Contact } from '../../crm/leads/contacts.repository.js';
import type { ChatMessage } from '../shared/agent.types.js';
import { classifyIntent } from './intent.classifier.js';

export type AgentType = 'commercial' | 'support';

/**
 * `contact.type === 'student'` não força mais suporte: aluno matriculado que
 * quer contratar outro idioma ou mais aulas é venda nova, e o atalho antigo
 * mandava esse pedido pro suporte, matando o upsell. Aluno segue caindo no
 * suporte por padrão — só quando a intenção comercial é explícita ele vai pro
 * comercial.
 *
 * Em caso ambíguo (mensagem curta, classificador indisponível), o desempate é
 * o tipo do contato: lead → comercial, aluno → suporte.
 */
export async function routeAgent(
  contact: Contact,
  message: string,
  history: ChatMessage[] = [],
): Promise<AgentType> {
  const intent = await classifyIntent(message, history);

  if (intent === 'commercial') return 'commercial';
  if (intent === 'support') return 'support';

  return contact.type === 'student' ? 'support' : 'commercial';
}
