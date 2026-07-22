import { shouldReactivate } from '../../src/agents/shared/agent.reactivation.js';

const doubt = await shouldReactivate('quanto custa remarcar minha aula de amanhã?');
console.log('duvida real ->', doubt);

const closed = await shouldReactivate('ok, obrigada 👍');
console.log('encerrado ->', closed);
