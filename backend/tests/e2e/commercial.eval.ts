/**
 * Eval de comportamento do agente comercial — verifica as regras que já
 * quebraram em atendimento real (pergunta redundante, horário inventado,
 * abreviação, tabela repetida, dois idiomas cortados).
 *
 * Chama a OpenAI direto com o system prompt de produção. Não toca Redis,
 * Supabase nem WhatsApp — nenhum dado real é criado.
 *
 * Rodar: npx tsx --env-file=../.env tests/e2e/commercial.eval.ts
 *
 * O modelo é estocástico: uma falha isolada pede repetição antes de virar
 * conclusão. Falha consistente = regra não está sendo seguida.
 */
import { openai } from '../../src/config/openai.js';
import { env } from '../../src/config/env.js';
import { composeSystemPrompt } from '../../src/agents/shared/agent.prompt.js';
import {
  commercialResponseJsonSchema,
  commercialTurnSchema,
} from '../../src/agents/commercial/commercial.schema.js';

const SYSTEM_PROMPT = composeSystemPrompt([
  'commercial/prompt-v1.md',
  'shared/persona.md',
  'shared/forbidden-phrases.md',
  'shared/school-info.md',
  'commercial/objections.md',
  'commercial/handoff-rules.md',
]);

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

async function run(history: Turn[], message: string) {
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL_COMMERCIAL,
    temperature: env.AGENT_TEMPERATURE,
    max_tokens: env.OPENAI_MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message },
    ],
    response_format: { type: 'json_schema', json_schema: commercialResponseJsonSchema },
  });

  return commercialTurnSchema.parse(JSON.parse(completion.choices[0]?.message?.content ?? '{}'));
}

let failures = 0;

function assert(label: string, pass: boolean, evidence?: string) {
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${label}${!pass && evidence ? `\n         > ${evidence}` : ''}`);
}

/** "19h", "19:00", "às 8h" — hora específica que a escola não confirmou. */
const HOUR_PATTERN = /\b\d{1,2}\s*(h\b|:\d{2})/i;
const ABBREV_PATTERN = /\b(pra|pro|Prof\.|vc|tb|pq|blz)\b/i;

console.log('\n[1] primeira mensagem "oi" — abertura neutra (número atende comercial + suporte)');
{
  const t = await run([], 'oi');
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  assert('não presume interesse comercial', !/demonstrou interesse/i.test(t.reply), t.reply);
  assert('pergunta o nome', /nome|como.*chama/i.test(t.reply), t.reply);
  assert('não manda tabela', t.send_price_table === false);
  assert('sem abreviação', !ABBREV_PATTERN.test(t.reply), t.reply);
}

console.log('\n[2] lead entrega tudo de uma vez — não pode reperguntar');
{
  const t = await run(
    [
      { role: 'user', content: 'oi' },
      {
        role: 'assistant',
        content: 'Oi! Tudo bem? 😊 Sou a Jessica, da equipe da Results Idiomas. Qual é o seu nome?',
      },
    ],
    'sou o Marcos. quero fazer inglês para uma viagem em dezembro, prefiro aula particular e de manhã',
  );
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  const d = t.collected_data;
  assert('capturou idioma', !!d.interested_course, JSON.stringify(d.interested_course));
  assert('capturou objetivo', !!d.objective, JSON.stringify(d.objective));
  assert('capturou disponibilidade', !!d.availability, JSON.stringify(d.availability));
  assert('capturou nome', !!d.full_name, JSON.stringify(d.full_name));
  assert('não repergunta idioma', !/qual idioma|inglês ou espanhol/i.test(t.reply), t.reply);
  assert('não repergunta particular/turma', !/particular ou (em )?turma/i.test(t.reply), t.reply);
  assert('não repergunta turno', !/manhã, tarde ou noite/i.test(t.reply), t.reply);
  assert('não oferece hora específica', !HOUR_PATTERN.test(t.reply), t.reply);
  assert(
    'explica o método, não só cita o nome',
    /convers|correção|primeira aula|ritmo|revis/i.test(t.reply),
    t.reply,
  );
}

console.log('\n[3] preço com preferência já dita — manda tabela sem reperguntar');
{
  const t = await run(
    [
      { role: 'user', content: 'quero fazer inglês para trabalho, prefiro aula particular' },
      {
        role: 'assistant',
        content:
          'Que ótimo! O Método Callan trabalha conversação desde a primeira aula, com correção na hora.',
      },
    ],
    'e quanto custa?',
  );
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  assert('marcou price_asked', t.collected_data.price_asked === true);
  assert('não repergunta particular/turma', !/particular ou (em )?turma/i.test(t.reply), t.reply);
  assert('manda a tabela', t.send_price_table === true);
  assert('variante geral', t.price_table_variant === 'geral');
  assert('não escreve valor em texto', !/R\$|\d{3},\d{2}/.test(t.reply), t.reply);
}

console.log('\n[4] lead quer os dois idiomas — estimular, nunca cortar');
{
  const t = await run([], 'oi, eu queria fazer inglês E espanhol ao mesmo tempo, dá?');
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  assert('não manda escolher um', !/apenas um|só um|escolher um|um por vez/i.test(t.reply), t.reply);
  assert('não questiona se tem tempo', !/tem tempo|vai dar conta/i.test(t.reply), t.reply);
}

console.log('\n[5] pedido de humano + desconto — needs_human');
{
  const t = await run([], 'quero falar com uma pessoa de verdade, e queria um desconto especial');
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  assert('marcou needs_human', t.collected_data.needs_human === true);
  assert('não promete desconto', !/desconto de|\d+%/i.test(t.reply), t.reply);
}

console.log('\n[6] lead pede horário específico — não pode inventar');
{
  const t = await run(
    [
      { role: 'user', content: 'quero agendar a aula experimental de inglês' },
      { role: 'assistant', content: 'Perfeito! Você prefere de manhã, tarde ou noite?' },
    ],
    'de manhã. que horários vocês têm na terça?',
  );
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  assert('não inventa horário', !HOUR_PATTERN.test(t.reply), t.reply);
  assert('remete à equipe', /equipe|responsáve|confirm/i.test(t.reply), t.reply);
  assert('marcou wants_to_schedule', t.collected_data.wants_to_schedule === true);
}

console.log(`\n${failures === 0 ? 'TODOS OS CHECKS PASSARAM' : `${failures} CHECK(S) FALHARAM`}`);
process.exit(failures === 0 ? 0 : 1);
