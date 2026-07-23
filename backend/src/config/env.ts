import { z } from 'zod';

const envSchema = z.object({
  // OpenAI (ADR-008)
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL_COMMERCIAL: z.string().default('gpt-4.1-mini'),
  OPENAI_MODEL_SUPPORT: z.string().default('gpt-4.1-mini'),
  OPENAI_MODEL_ROUTER: z.string().default('gpt-4.1-mini'),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // Knowledge base / RAG (ADR-009)
  KNOWLEDGE_MATCH_COUNT: z.coerce.number().int().positive().default(4),

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
