import { chunkMarkdown } from '../../src/knowledge/knowledge.chunker.js';

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${label}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)}) ${pass ? 'PASS' : 'FAIL'}`);
}

const simple = `# Título (ignorado, não é heading nível 2)

## Preços

Curso Business custa R$500/mês.

## Horários

Manhã e noite disponíveis.`;

const simpleChunks = chunkMarkdown('test.md', simple);
check('simple: 3 chunks (preâmbulo + 2 headings)', simpleChunks.length, 3);
check('simple: preâmbulo sem heading nível 2', simpleChunks[0].heading, null);
check('simple: heading do segundo', simpleChunks[1].heading, 'Preços');
check('simple: content do segundo', simpleChunks[1].content, 'Curso Business custa R$500/mês.');
check('simple: source propagado', simpleChunks[2].source, 'test.md');

const noHeading = 'Texto solto sem heading nível 2.';
const noHeadingChunks = chunkMarkdown('flat.md', noHeading);
check('sem heading: 1 chunk', noHeadingChunks.length, 1);
check('sem heading: heading null', noHeadingChunks[0].heading, null);

const empty = '';
check('vazio: 0 chunks', chunkMarkdown('empty.md', empty).length, 0);

// seção grande deve quebrar em múltiplos chunks
const bigParagraph = 'Lorem ipsum dolor sit amet. '.repeat(150); // ~4200 chars, acima do limite de 2800
const bigDoc = `## Seção Grande\n\n${bigParagraph}\n\n${bigParagraph}`;
const bigChunks = chunkMarkdown('big.md', bigDoc);
check('seção grande: mais de 1 chunk', bigChunks.length > 1, true);
check('seção grande: todos com mesmo heading', bigChunks.every((c) => c.heading === 'Seção Grande'), true);
