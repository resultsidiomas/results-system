import type { Contact } from '../../crm/leads/contacts.repository.js';
import { classifyIntent } from './intent.classifier.js';

export type AgentType = 'commercial' | 'support';

export async function routeAgent(contact: Contact, message: string): Promise<AgentType> {
  if (contact.type === 'student') return 'support';

  const intent = await classifyIntent(message);
  return intent === 'support' ? 'support' : 'commercial';
}
