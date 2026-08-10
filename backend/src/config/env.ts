import { z } from 'zod';

const envSchema = z.object({
  // OpenAI (ADR-008)
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL_COMMERCIAL: z.string().default('gpt-4.1-mini'),
  OPENAI_MODEL_SUPPORT: z.string().default('gpt-4.1-mini'),
  OPENAI_MODEL_ROUTER: z.string().default('gpt-4.1-mini'),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  // Agentes M1/M2 rodavam sem temperature (default 1.0 da OpenAI) — aderência
  // instável a regra rígida (abreviação, horário inventado, frase repetida).
  // 0.4 mantém naturalidade e segue o prompt. Classificadores usam 0 próprio.
  AGENT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  // Uma tentativa extra quando a chamada falha ou vem truncada. Sem isso, um
  // 429/timeout único da OpenAI já entregava a resposta de fallback ("tive um
  // problema técnico") e — pior — pausava a IA pro contato (ver ADR-014).
  AGENT_COMPLETION_ATTEMPTS: z.coerce.number().int().min(1).max(4).default(2),
  // Emoji por resposta (não por bolha). O modelo fechava toda mensagem com 😊
  // porque os exemplos do prompt faziam isso; corte determinístico garante.
  AGENT_MAX_EMOJIS: z.coerce.number().int().min(0).max(5).default(1),
  // Teto de bolhas por resposta — acima disso o resto é fundido na última.
  AGENT_MAX_BUBBLES: z.coerce.number().int().min(1).max(10).default(5),
  // Duração da pausa após handoff: 1 dia (decisão do usuário, 2026-07-25).
  // Prazo absoluto contado do momento da pausa; depois disso a IA reassume o
  // contato sozinha — não existe rotina de resume implementada (ver ADR-014).
  AGENT_PAUSE_MAX_HOURS: z.coerce.number().int().min(1).max(168).default(24),

  // Knowledge base / RAG (ADR-009)
  KNOWLEDGE_MATCH_COUNT: z.coerce.number().int().positive().default(4),
  // Piso de similaridade — sem isso o RPC devolve sempre 4 chunks, mesmo
  // irrelevantes, diluindo o prompt com contexto que não responde a pergunta.
  KNOWLEDGE_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.3),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),
  REDIS_PASSWORD: z.string().optional(),
  AGENT_MESSAGE_WAIT_MS: z.coerce.number().int().positive().default(18000),
  AGENT_BLOCK_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  AGENT_HISTORY_LIMIT: z.coerce.number().int().positive().default(15),

  // UAZAPI
  UAZAPI_URL: z.string().min(1),
  UAZAPI_TOKEN: z.string().min(1),
  UAZAPI_INSTANCE: z.string().min(1),
  UAZAPI_SEND_DELAY_MS: z.coerce.number().int().positive().default(1500),
  UAZAPI_WEBHOOK_SECRET: z.string().min(1),

  // WhatsApp Oficial Meta (M5 — ainda não implementado, sem uso no código hoje)
  WA_API_TOKEN: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_BUSINESS_ACCOUNT_ID: z.string().optional(),

  // Groq (transcrição de áudio — sem isso, mensagens de áudio falham, texto/imagem seguem ok)
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('whisper-large-v3-turbo'),

  // Handoff (M1 -> Gi)
  GI_ALERT_NUMBER: z.string().optional(),

  // Console de teste do agente (frontend interno, sem WhatsApp real)
  TEST_CONSOLE_TOKEN: z.string().min(1),

  // Webhook do fluxo n8n em modo de teste: mesma entrada da UAZAPI, mas o
  // fluxo desvia do node de envio e devolve a resposta ao chamador. Sem isso o
  // console de teste roda a engine direto no backend (sem a camada n8n) e
  // avisa qual caminho respondeu.
  N8N_TEST_WEBHOOK_URL: z.string().url().optional(),
  N8N_TEST_SECRET: z.string().optional(),
  // O fluxo tem espera de debounce (`AGENT_MESSAGE_WAIT_MS` equivalente no
  // n8n), então o timeout precisa ser maior que ela.
  N8N_TEST_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),

  // Endpoint /api/v1/n8n-agent/run — token que o n8n manda no header x-internal-key
  INTERNAL_API_KEY: z.string().min(1),

  // Allowlist temporária de teste (M1 em validação) — lista de wa_chatid
  // separados por vírgula; se definida, webhook só responde a esses números.
  // Vazio/ausente = responde a todos (comportamento normal de produção).
  TEST_ALLOWED_NUMBERS: z.string().optional(),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SCHEDULE_RESUME_HOUR: z.coerce.number().int().min(0).max(23).default(8),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n  ');
  throw new Error(`Invalid environment configuration:\n  ${missing}`);
}

export const env = parsed.data;
export type Env = typeof env;
