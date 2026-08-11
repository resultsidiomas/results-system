import { testPhone, isTestPhone, TEST_PHONE_PREFIX } from '../../src/shared/test-contact.js';

/**
 * O identificador do contato sintético precisa ser o MESMO em três lugares que
 * não se enxergam:
 *
 * 1. o console, ao gravar e ao ler a sessão (`admin/test-chat.routes.ts`);
 * 2. o payload mandado ao fluxo n8n (`testing/n8n-test-flow.ts`), que volta
 *    como `sessionId` em `/api/v1/n8n-agent/run` e vira telefone do contato;
 * 3. o filtro da aba de conversas reais (`admin/real-conversations.repository.ts`).
 *
 * Quando divergiram, o teste via n8n criava contato sem prefixo: a conversa
 * sumia do painel, aparecia como lead real, escapava do "Zerar sessão" e
 * disparava alerta de WhatsApp pra equipe com dado fictício.
 */
let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${pass ? 'PASS' : 'FAIL'}`,
  );
}

check('telefone sintético leva o prefixo', testPhone('teste-1'), 'test-teste-1');

// O que o console manda ao n8n tem que ser reconhecido de volta como teste
// depois de dar a volta pelo fluxo.
check('ida e volta pelo n8n continua sendo teste', isTestPhone(testPhone('teste-1')), true);

// Sessão crua era o valor mandado antes da correção — não pode passar por teste,
// senão o contato do fluxo n8n vira lead real na aba de conversas reais.
check('sessão sem prefixo NÃO é teste', isTestPhone('teste-1'), false);

// Número real jamais pode ser confundido com teste, senão some da aba de
// conversas reais e para de alertar a equipe.
check('telefone real não é teste', isTestPhone('5511999999999'), false);
check('telefone real com sufixo do WhatsApp', isTestPhone('5511999999999@s.whatsapp.net'), false);

check('prefixo é o esperado pelo restante do código', TEST_PHONE_PREFIX, 'test-');

console.log(failures === 0 ? '\nall pass' : `\n${failures} fail`);
process.exit(failures === 0 ? 0 : 1);
