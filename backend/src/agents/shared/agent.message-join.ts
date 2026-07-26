import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

function queueKey(remoteJid: string): string {
  return `join:${remoteJid}`;
}

/** Duas vezes a janela de espera — fila órfã não sobrevive à conversa. */
function queueTtlSeconds(): number {
  return Math.max(60, Math.ceil((env.AGENT_MESSAGE_WAIT_MS * 2) / 1000));
}

interface QueuedMessage {
  id: string;
  text: string;
}

/**
 * Junção anti-flood: empilha a mensagem, espera `AGENT_MESSAGE_WAIT_MS` e
 * segue só se ainda for a última da fila. Quem tem a mensagem mais nova
 * responde por todas; as invocações anteriores se retiram.
 *
 * O desempate é por `message.id`, não pelo texto: comparar texto fazia duas
 * mensagens iguais ("oi" e "oi") acharem, as duas, que eram a última — as duas
 * seguiam e o lead recebia resposta dobrada. A fila também ganhou prefixo de
 * namespace (colidia com outras chaves do Redis, `remoteJid` cru) e TTL, senão
 * uma invocação interrompida deixava mensagem velha grudada no próximo turno.
 */
export async function joinMessages(
  remoteJid: string,
  messageId: string,
  message: string,
): Promise<string | null> {
  const key = queueKey(remoteJid);
  const entry: QueuedMessage = { id: messageId, text: message };

  await redis.rpush(key, JSON.stringify(entry));
  await redis.expire(key, queueTtlSeconds());
  await new Promise((resolve) => setTimeout(resolve, env.AGENT_MESSAGE_WAIT_MS));

  const queued = (await redis.lrange(key, 0, -1)).map(parseEntry).filter(isQueued);
  const last = queued[queued.length - 1];

  // Fila vazia = outra invocação já consumiu essas mensagens (não repete).
  if (last === undefined || last.id !== messageId) return null;

  await redis.del(key);
  return queued.map((item) => item.text).join(' ');
}

function parseEntry(raw: string): QueuedMessage | null {
  try {
    const parsed = JSON.parse(raw) as Partial<QueuedMessage>;
    if (typeof parsed.id === 'string' && typeof parsed.text === 'string') {
      return { id: parsed.id, text: parsed.text };
    }
  } catch {
    // Entrada em formato antigo (texto cru, sem id) — descartada em vez de
    // derrubar o turno; a próxima mensagem já entra no formato novo.
  }

  logger.warn('discarding unparseable join queue entry');
  return null;
}

function isQueued(entry: QueuedMessage | null): entry is QueuedMessage {
  return entry !== null;
}
