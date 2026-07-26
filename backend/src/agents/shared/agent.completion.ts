import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { sanitizeOutgoingText } from '../../shared/text-sanitizer.js';

/** Nudge injetado só na retentativa — nunca no prefixo estável (prompt caching). */
const NUDGE_TRUNCATED =
  'Sua última tentativa passou do limite de tokens e foi cortada. Responda de novo, mesmo conteúdo, mas mais curto: no máximo 3 frases curtas no campo reply.';
const NUDGE_REPEATED =
  'Sua última tentativa repetiu, palavra por palavra, uma mensagem que você já mandou nessa conversa. Reescreva avançando a conversa a partir do que o contato acabou de dizer, sem repetir texto anterior.';

export interface StructuredTurnOptions<T> {
  /** Rótulo pro log ('commercial' | 'support'). */
  label: string;
  model: string;
  messages: ChatCompletionMessageParam[];
  /** Objeto `json_schema` do response_format. */
  jsonSchema: unknown;
  /** Valida e tipa o JSON já parseado (schema Zod do agente). */
  parse: (raw: unknown) => T;
  /** Extrai o texto que vai pro contato — usado na guarda de repetição. */
  replyOf: (turn: T) => string;
  /** Última resposta enviada nessa conversa, pra detectar repetição literal. */
  lastAssistantReply?: string | null;
}

/**
 * Uma chamada estruturada à OpenAI com as três guardas que faltavam.
 *
 * 1. **Retentativa** — erro de rede/429/timeout ou JSON inválido não vira mais
 *    resposta de fallback na primeira falha. Era a maior fonte de "o agente
 *    parou de responder": falha transitória → fallback → handoff → `pausar_ia`.
 * 2. **Truncamento** — `finish_reason === 'length'` corta o JSON no meio, o
 *    `JSON.parse` estoura e o turno inteiro se perdia. Agora é detectado e
 *    refeito pedindo resposta mais curta.
 * 3. **Repetição** — o modelo reenviava a mesma frase (observado em
 *    atendimento real, ex: a mensagem da tabela de preços idêntica duas
 *    vezes). Repetição literal da última resposta força uma retentativa; se
 *    insistir, a resposta é aceita (repetir é ruim, ficar mudo é pior).
 */
export async function completeStructuredTurn<T>(options: StructuredTurnOptions<T>): Promise<T> {
  const { label, model, messages, jsonSchema, parse, replyOf, lastAssistantReply } = options;
  const attempts = env.AGENT_COMPLETION_ATTEMPTS;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const nudge = attempt === 1 ? null : nudgeFor(lastError);
    const attemptMessages: ChatCompletionMessageParam[] = nudge
      ? [...messages, { role: 'system', content: nudge }]
      : messages;

    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: attemptMessages,
        temperature: env.AGENT_TEMPERATURE,
        max_tokens: env.OPENAI_MAX_TOKENS,
        response_format: { type: 'json_schema', json_schema: jsonSchema as never },
      });

      const choice = completion.choices[0];
      if (choice?.finish_reason === 'length') throw new TruncatedCompletionError();

      const turn = parse(JSON.parse(choice?.message?.content ?? '{}'));

      if (attempt < attempts && isLiteralRepeat(replyOf(turn), lastAssistantReply)) {
        throw new RepeatedReplyError();
      }

      if (attempt > 1) {
        logger.info(`${label} turn recovered on retry`, { attempt });
      }

      return turn;
    } catch (err) {
      lastError = err;
      logger.warn(`${label} turn attempt failed`, {
        attempt,
        attempts,
        errorMessage: (err as Error).message,
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} turn failed`);
}

class TruncatedCompletionError extends Error {
  constructor() {
    super('completion truncated (finish_reason=length)');
  }
}

class RepeatedReplyError extends Error {
  constructor() {
    super('reply repeats the previous assistant message verbatim');
  }
}

function nudgeFor(error: unknown): string | null {
  if (error instanceof TruncatedCompletionError) return NUDGE_TRUNCATED;
  if (error instanceof RepeatedReplyError) return NUDGE_REPEATED;
  return null;
}

/**
 * Compara já normalizado (markdown/emoji fora, minúsculas, espaço colapsado):
 * "Vou te mandar a tabela 😊" e "vou te mandar a tabela" são a mesma mensagem
 * pro lead.
 */
export function isLiteralRepeat(reply: string, previous: string | null | undefined): boolean {
  if (!previous) return false;

  const normalize = (text: string) =>
    sanitizeOutgoingText(text, 0).toLowerCase().replace(/\s+/g, ' ').trim();

  const current = normalize(reply);
  return current.length > 0 && current === normalize(previous);
}
