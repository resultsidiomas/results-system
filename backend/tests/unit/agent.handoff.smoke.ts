import { findOrCreateContact } from '../../src/crm/leads/contacts.repository.js';
import { notifyGi } from '../../src/agents/shared/agent.handoff.js';

const contact = await findOrCreateContact('5511977776666', 'Handoff Smoke Test');
console.log('contact:', contact.id, contact.pausar_ia);

await notifyGi(contact.id, contact.phone, 'Lead quente!', 'resposta de teste');

const after = await findOrCreateContact('5511977776666', 'Handoff Smoke Test');
console.log('pausar_ia after handoff:', after.pausar_ia, after.pausar_ia === 'Sim' ? 'PASS' : 'FAIL');
