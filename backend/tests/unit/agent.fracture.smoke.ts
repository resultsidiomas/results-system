import { fractureMessage } from '../../src/agents/shared/agent.fracture.js';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(`${label}: ${JSON.stringify(actual)} ${pass ? 'PASS' : `FAIL (expected ${JSON.stringify(expected)})`}`);
}

check('quebra simples separa bolhas', fractureMessage('Primeira frase aqui\nSegunda frase aqui'), [
  'Primeira frase aqui',
  'Segunda frase aqui',
]);

check('linha em branco também separa', fractureMessage('Primeira frase aqui\n\nSegunda frase aqui'), [
  'Primeira frase aqui',
  'Segunda frase aqui',
]);

// Era daqui que saía a bolha com "---" sozinho.
check('separador não gera bolha', fractureMessage('Primeira frase aqui\n---\nSegunda frase aqui'), [
  'Primeira frase aqui',
  'Segunda frase aqui',
]);

check('bolha minúscula gruda na anterior', fractureMessage('Vou te mandar a tabela\nOk!'), [
  'Vou te mandar a tabela\nOk!',
]);

check('emoji sozinho não vira bolha', fractureMessage('Tudo certo por aqui\n😊'), ['Tudo certo por aqui']);

const many = fractureMessage(
  ['bolha numero um aqui', 'bolha numero dois aqui', 'bolha numero tres aqui'].join('\n'),
  2,
);
check('teto de bolhas funde o excedente', many, [
  'bolha numero um aqui',
  'bolha numero dois aqui\nbolha numero tres aqui',
]);

check('texto vazio não gera bolha', fractureMessage('   \n---\n  '), []);

const url = 'https://casa.callanonline.com/password-change-request';
check('URL fica inteira numa bolha', fractureMessage(`Segue o link de reset\n${url}`), [
  'Segue o link de reset',
  url,
]);

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
