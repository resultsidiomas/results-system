/**
 * Eval de comportamento do agente de suporte. Mesmo espírito do
 * `commercial.eval.ts`: chama a OpenAI direto com o system prompt de
 * produção, sem tocar Redis, Supabase nem WhatsApp.
 *
 * Rodar: npx tsx --env-file=../.env tests/e2e/support.eval.ts
 */
import { openai } from '../../src/config/openai.js';
import { env } from '../../src/config/env.js';
import { composeSystemPrompt } from '../../src/agents/shared/agent.prompt.js';
import { supportResponseJsonSchema, supportTurnSchema } from '../../src/agents/support/support.schema.js';

const SYSTEM_PROMPT = composeSystemPrompt([
  'support/prompt-v1.md',
  'shared/persona.md',
  'shared/forbidden-phrases.md',
  'shared/school-info.md',
  'support/rescheduling-rules.md',
  'support/retention-flow.md',
]);

const PASSWORD_URL = 'https://casa.callanonline.com/password-change-request';

async function run(message: string) {
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL_SUPPORT,
    temperature: env.AGENT_TEMPERATURE,
    max_tokens: env.OPENAI_MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message },
    ],
    response_format: { type: 'json_schema', json_schema: supportResponseJsonSchema },
  });

  return supportTurnSchema.parse(JSON.parse(completion.choices[0]?.message?.content ?? '{}'));
}

let failures = 0;

function assert(label: string, pass: boolean, evidence?: string) {
  if (!pass) failures++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${label}${!pass && evidence ? `\n         > ${evidence}` : ''}`);
}

const ABBREV_PATTERN = /\b(pra|pro|Prof\.|vc|tb|pq|blz)\b/i;

console.log('\n[1] esqueci a senha — link precisa sair inteiro (bug real: chegou "com/password-change-request")');
{
  const t = await run('esqueci minha senha do Callan app, não consigo entrar');
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  assert('manda o link completo', t.reply.includes(PASSWORD_URL), t.reply);
  assert(
    'link não quebrado por linha/bolha',
    !/casa\.callanonline\.com\s*\n|\n\s*com\/password/i.test(t.reply),
    t.reply,
  );
  assert('sem abreviação', !ABBREV_PATTERN.test(t.reply), t.reply);
}

console.log('\n[2] remarcar aula — explica a regra de 3h e escala, nunca confirma sozinha');
{
  const t = await run('preciso remarcar minha aula de amanhã, dá?');
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  assert('escala', t.needs_human === true);
  assert('motivo reagendamento', t.escalation_reason === 'reagendamento', String(t.escalation_reason));
  assert('cita a antecedência mínima', /3\s*h|três horas/i.test(t.reply), t.reply);
  assert(
    'não confirma remarcação sozinha',
    !/remarcad|reagendad[ao] com sucesso|prontinho/i.test(t.reply),
    t.reply,
  );
}

console.log('\n[3] cancelamento — acolhe, pergunta motivo, escala, não executa');
{
  const t = await run('quero cancelar minha matrícula');
  console.log(`  reply: ${JSON.stringify(t.reply)}`);
  assert('escala', t.needs_human === true);
  assert('motivo cancelamento', t.escalation_reason === 'cancelamento', String(t.escalation_reason));
  assert(
    'pergunta o motivo (retention-flow)',
    /motivo|por que|aconteceu|tem relação com|escola, o professor|melhorar/i.test(t.reply),
    t.reply,
  );
  assert(
    'não confirma cancelamento',
    !/cancelad[ao]|cancelamento (foi )?(confirmad|efetuad)/i.test(t.reply),
    t.reply,
  );
}

console.log(`\n${failures === 0 ? 'TODOS OS CHECKS PASSARAM' : `${failures} CHECK(S) FALHARAM`}`);
process.exit(failures === 0 ? 0 : 1);
