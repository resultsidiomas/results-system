import { isLiteralRepeat } from '../../src/agents/shared/agent.completion.js';
import { lastAssistantReply } from '../../src/agents/shared/agent.context.js';
import type { ChatMessage } from '../../src/agents/shared/agent.types.js';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(`${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${pass ? 'PASS' : 'FAIL'}`);
}

const tabela = 'Vou te mandar aqui nossa tabela de valores certinha';

check('mesma frase é repetição', isLiteralRepeat(tabela, tabela), true);
// Foi exatamente o caso visto em atendimento: mesma mensagem da tabela, só o
// emoji mudando de lugar.
check('mesma frase com emoji diferente é repetição', isLiteralRepeat(`${tabela} 😊`, `${tabela} 🎓`), true);
check('caixa e espaço não contam', isLiteralRepeat(tabela.toUpperCase(), `  ${tabela}  `), true);
check('frase diferente não é repetição', isLiteralRepeat(tabela, 'Prefere manhã ou noite?'), false);
check('sem histórico não é repetição', isLiteralRepeat(tabela, null), false);
check('resposta vazia não é repetição', isLiteralRepeat('', ''), false);

const history: ChatMessage[] = [
  { role: 'user', content: 'oi', at: '2026-07-25T10:00:00.000Z' },
  { role: 'assistant', content: 'Oi! Tudo bem?', at: '2026-07-25T10:00:01.000Z' },
  { role: 'user', content: 'quanto custa?', at: '2026-07-25T10:01:00.000Z' },
];
check('pega a última fala da IA, não a do lead', lastAssistantReply(history), 'Oi! Tudo bem?');
check('histórico sem IA devolve null', lastAssistantReply([history[0]!]), null);
check('histórico vazio devolve null', lastAssistantReply([]), null);

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
