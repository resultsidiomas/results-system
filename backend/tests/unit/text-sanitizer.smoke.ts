import { sanitizeOutgoingText } from '../../src/shared/text-sanitizer.js';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(`${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${pass ? 'PASS' : 'FAIL'}`);
}

// "\n" literal (dois caracteres) que sobrevive ao JSON.parse.
check('barra-n literal vira quebra real', sanitizeOutgoingText('oi\\ntudo bem?'), 'oi\ntudo bem?');

// Separador markdown copiado do system prompt — foi pro lead como bolha solta.
check(
  'linha de separador removida',
  sanitizeOutgoingText('Perfeito!\n---\nVou te mandar a tabela.'),
  'Perfeito!\nVou te mandar a tabela.',
);
check('separador *** removido', sanitizeOutgoingText('a\n***\nb'), 'a\nb');
check('separador === removido', sanitizeOutgoingText('a\n===\nb'), 'a\nb');

// Markdown de formatação.
check('negrito ** vira * do WhatsApp', sanitizeOutgoingText('é **individual** sim'), 'é *individual* sim');
check('cabeçalho perde o #', sanitizeOutgoingText('## Sobre o método'), 'Sobre o método');
check('marcador de lista removido', sanitizeOutgoingText('- conversação\n- correção'), 'conversação\ncorreção');
check('comentário HTML removido', sanitizeOutgoingText('<!-- fonte: x -->oi'), 'oi');
check('crase removida', sanitizeOutgoingText('use o `link` aqui'), 'use o link aqui');
check(
  'link markdown vira URL legível',
  sanitizeOutgoingText('[acesse aqui](https://casa.callanonline.com/x)'),
  'acesse aqui: https://casa.callanonline.com/x',
);

// Emoji: limite é por resposta inteira, não por bolha.
check('um emoji passa', sanitizeOutgoingText('Oi! Tudo bem? 😊', 1), 'Oi! Tudo bem? 😊');
check(
  'emoji além do limite é cortado',
  sanitizeOutgoingText('Oi! 😊 Tudo bem? 🎓 Vamos lá 🙏', 1),
  'Oi! 😊 Tudo bem? Vamos lá',
);
check('limite zero remove todos', sanitizeOutgoingText('valeu 😊🙏', 0), 'valeu');
check(
  'emoji composto conta como um só',
  sanitizeOutgoingText('família 👩‍👩‍👧 e mais 😊', 1),
  'família 👩‍👩‍👧 e mais',
);

// URL nunca deve ser tocada.
check(
  'URL intacta',
  sanitizeOutgoingText('https://casa.callanonline.com/password-change-request'),
  'https://casa.callanonline.com/password-change-request',
);

check('linhas em branco extras colapsadas', sanitizeOutgoingText('a\n\n\n\nb'), 'a\n\nb');

// Travessão: a regra existia só no prompt e o modelo continuou usando, porque
// os próprios exemplos do prompt eram escritos com travessão.
check(
  'travessão no meio da frase vira vírgula',
  sanitizeOutgoingText('Perfeito, particular então — vou te mandar a tabela'),
  'Perfeito, particular então, vou te mandar a tabela',
);
check(
  'meia-risca também é convertida',
  sanitizeOutgoingText('aulas online – com professor nativo'),
  'aulas online, com professor nativo',
);
check(
  'travessão iniciando linha sai inteiro',
  sanitizeOutgoingText('O método tem:\n— conversação\n— correção na hora'),
  'O método tem:\nconversação\ncorreção na hora',
);
check(
  'travessão colado em pontuação não duplica vírgula',
  sanitizeOutgoingText('É isso —, combinado'),
  'É isso, combinado',
);
check(
  'travessão no fim da linha não deixa vírgula órfã',
  sanitizeOutgoingText('Perfeito —\nvou confirmar'),
  'Perfeito\nvou confirmar',
);
check('hífen normal é preservado', sanitizeOutgoingText('aula bem-vinda'), 'aula bem-vinda');

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
