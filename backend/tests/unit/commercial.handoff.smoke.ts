import { findOrCreateContact } from '../../src/crm/leads/contacts.repository.js';
import { handoffToGi } from '../../src/agents/commercial/commercial.handoff.js';

const contact = await findOrCreateContact('5511977776666', 'Handoff Smoke Test');
console.log('contact:', contact.id, contact.pausar_ia);

await handoffToGi(contact.id, contact.phone, 'resposta de teste');

const after = await findOrCreateContact('5511977776666', 'Handoff Smoke Test');
console.log('pausar_ia after handoff:', after.pausar_ia, after.pausar_ia === 'Sim' ? 'PASS' : 'FAIL');
