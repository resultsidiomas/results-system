import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

function blockKey(remoteJid: string): string {
  return `${remoteJid}_block`;
}

function pauseUntilKey(contactId: string): string {
  return `pause_until:${contactId}`;
}

export async function isBlocked(remoteJid: string): Promise<boolean> {
  const value = await redis.get(blockKey(remoteJid));
  return value !== null;
}

export async function setBlock(remoteJid: string): Promise<void> {
  await redis.set(blockKey(remoteJid), 'true', 'EX', env.AGENT_BLOCK_TTL_SECONDS);
}

export async function clearBlock(remoteJid: string): Promise<void> {
  await redis.del(blockKey(remoteJid));
}

/**
 * Registra o instante em que a pausa começou, pro prazo ser **absoluto**.
 *
 * Sem isso o único carimbo disponível é `contacts.updated_at`, que é bumpado a
 * cada update do contato — inclusive pelo snap-back de `pausar_ia` depois de
 * cada dúvida respondida durante a pausa (ADR-011). O prazo ficava deslizante:
 * lead que manda mensagem todo dia nunca destravava. Chave com TTL de folga
 * (prazo + 7 dias) pra sobreviver a operação normal do Redis.
 */
export async function markPauseStart(contactId: string): Promise<void> {
  const expiresAt = Date.now() + env.AGENT_PAUSE_MAX_HOURS * 3_600_000;
  const ttlSeconds = env.AGENT_PAUSE_MAX_HOURS * 3_600 + 7 * 86_400;

  try {
    await redis.set(pauseUntilKey(contactId), String(expiresAt), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('could not record pause start, falling back to contacts.updated_at', {
      contactId,
      errorMessage: (err as Error).message,
    });
  }
}

/**
 * `true` quando a pausa já passou de `AGENT_PAUSE_MAX_HOURS` (1 dia) e a IA
 * pode reassumir o contato.
 *
 * Prazo absoluto quando o carimbo do Redis existe; `contacts.updated_at` é o
 * fallback (aproximado, mas erra pro lado de responder) pra contato que foi
 * pausado antes desta versão ou cujo carimbo expirou.
 */
export async function isPauseExpired(
  contactId: string,
  updatedAt: string | null | undefined,
): Promise<boolean> {
  try {
    const raw = await redis.get(pauseUntilKey(contactId));
    if (raw !== null) {
      const expiresAt = Number(raw);
      if (Number.isFinite(expiresAt)) return Date.now() > expiresAt;
    }
  } catch (err) {
    logger.warn('pause expiry lookup failed, falling back to contacts.updated_at', {
      contactId,
      errorMessage: (err as Error).message,
    });
  }

  if (!updatedAt) return false;

  const pausedAt = Date.parse(updatedAt);
  if (Number.isNaN(pausedAt)) return false;

  return Date.now() - pausedAt > env.AGENT_PAUSE_MAX_HOURS * 3_600_000;
}

/** Chamado quando a IA reassume — evita reavaliar um carimbo já vencido. */
export async function clearPauseStart(contactId: string): Promise<void> {
  try {
    await redis.del(pauseUntilKey(contactId));
  } catch (err) {
    logger.warn('could not clear pause start', {
      contactId,
      errorMessage: (err as Error).message,
    });
  }
}
