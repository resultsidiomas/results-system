/**
 * Simula uma conversa completa do agente comercial, do jeito que o lead veria
 * no WhatsApp: system prompt de produção → resposta do modelo → sanitizador →
 * fracionamento em bolhas → decisões de tabela/handoff/pausa.
 *
 * Roda sem Redis, sem Supabase e sem UAZAPI (histórico e estado ficam em
 * memória), então serve pra validar comportamento local antes/depois do deploy.
 * Só a plumbing de infra fica de fora.
 *
 * Rodar: npx tsx --env-file=../.env scripts/simulate-conversation.ts
 */
import { openai } from '../src/config/openai.js';
import { env } from '../src/config/env.js';
import { composeSystemPrompt } from '../src/agents/shared/agent.prompt.js';
import {
  commercialResponseJsonSchema,
  commercialTurnSchema,
  EMPTY_COLLECTED_DATA,
  mergeCollectedData,
} from '../src/agents/commercial/commercial.schema.js';
import type { CommercialCollectedData } from '../src/agents/commercial/commercial.schema.js';
import {
  scoreLead,
  decideHandoff,
  canSendPriceTable,
  isQualifiedLead,
} from '../src/agents/commercial/commercial.scoring.js';
import { sanitizeOutgoingText } from '../src/shared/text-sanitizer.js';
import { fractureMessage } from '../src/agents/shared/agent.fracture.js';

const SYSTEM_PROMPT = composeSystemPrompt([
  'commercial/prompt-v1.md',
  'shared/persona.md',
  'shared/forbidden-phrases.md',
  'shared/school-info.md',
  'commercial/objections.md',
  'commercial/handoff-rules.md',
]);

const EMOJI = /\p{Extended_Pictographic}/gu;
const SEPARATOR_LINE = /^\s*(?:[-*_=]\s*){3,}$/m;

const LEAD_SCRIPT = [
  'oi',
  'sou o Rafael',
  'queria fazer aulas de inglês, preciso pra uma promoção no trabalho',
  'já tentei um curso online antes mas desisti, muito chato',
  'e quanto custa?',
  'prefiro aula particular',
  'ainda não recebi a tabela, mas de manhã seria melhor pra mim',
  'pode ser, quero falar com um consultor sim',
];

interface State {
  history: { role: 'user' | 'assistant'; content: string }[];
  collected: CommercialCollectedData;
  messageCount: number;
  paused: boolean;
  problems: string[];
}

const state: State = {
  history: [],
  collected: EMPTY_COLLECTED_DATA,
  messageCount: 0,
  paused: false,
  problems: [],
};

function checkOutput(raw: string, turn: number) {
  const emojis = raw.match(EMOJI)?.length ?? 0;
  if (SEPARATOR_LINE.test(raw)) state.problems.push(`turno ${turn}: separador markdown na resposta`);
  if (raw.includes('**')) state.problems.push(`turno ${turn}: negrito ** na resposta`);
  if (raw.includes('`')) state.problems.push(`turno ${turn}: crase na resposta`);
  if (/<\/?regras/i.test(raw)) state.problems.push(`turno ${turn}: tag <regras> vazou`);
  if (emojis > env.AGENT_MAX_EMOJIS) {
    state.problems.push(`turno ${turn}: ${emojis} emoji no cru (limite ${env.AGENT_MAX_EMOJIS})`);
  }
  return emojis;
}

for (const [index, leadMessage] of LEAD_SCRIPT.entries()) {
  const turn = index + 1;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`LEAD: ${leadMessage}`);

  if (state.paused) {
    console.log('\n[IA pausada — quem responde daqui é a equipe. Fim da simulação.]');
    break;
  }

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL_COMMERCIAL,
    temperature: env.AGENT_TEMPERATURE,
    max_tokens: env.OPENAI_MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...state.history,
      { role: 'user', content: leadMessage },
    ],
    response_format: { type: 'json_schema', json_schema: commercialResponseJsonSchema },
  });

  const parsed = commercialTurnSchema.parse(
    JSON.parse(completion.choices[0]?.message?.content ?? '{}'),
  );

  const rawEmojis = checkOutput(parsed.reply, turn);
  const reply = sanitizeOutgoingText(parsed.reply);
  const bubbles = fractureMessage(reply);

  state.messageCount += 2;
  state.collected = mergeCollectedData(state.collected, parsed.collected_data);
  const score = scoreLead(state.collected, state.messageCount);
  const sendTable = canSendPriceTable(parsed.send_price_table, state.collected);
  const decision = decideHandoff(score, state.collected, false);

  bubbles.forEach((bubble, i) => console.log(`JESSICA [bolha ${i + 1}]: ${bubble}`));
  if (sendTable) console.log('JESSICA [imagem]: tabela de valores (variante geral)');

  const flags = Object.entries(state.collected)
    .filter(([, v]) => v !== null && v !== false)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ');

  console.log(
    `\n  bolhas=${bubbles.length} emoji_cru=${rawEmojis} score=${score} ` +
      `qualificado=${isQualifiedLead(state.collected)}`,
  );
  console.log(`  tabela: modelo=${parsed.send_price_table} enviada=${sendTable}`);
  console.log(`  handoff=${decision.handoff} pausa=${decision.pauseAi}${decision.reason ? ` (${decision.reason})` : ''}`);
  console.log(`  coletado: ${flags || '(nada ainda)'}`);

  state.history.push({ role: 'user', content: leadMessage });
  state.history.push({ role: 'assistant', content: reply });
  if (decision.pauseAi) state.paused = true;
}

console.log(`\n${'='.repeat(70)}`);
console.log(state.problems.length === 0 ? 'FORMATO: sem problemas' : `FORMATO: ${state.problems.length} problema(s)`);
state.problems.forEach((p) => console.log(`  - ${p}`));
console.log(`pausou ao fim: ${state.paused}`);
