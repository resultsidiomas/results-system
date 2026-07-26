import { redis } from '../../config/redis.js';
import { logger } from '../../shared/logger.js';

/** Janela de dedupe — cobre retentativa de webhook, não conversa. */
const SEEN_TTL_SECONDS = 900;

/**
 * `true` se esse `message.id` já foi processado nos últimos 15 min.
 *
 * A UAZAPI reentrega o evento quando o webhook demora ou responde erro, e sem
 * isso a retentativa gerava uma segunda resposta pro mesmo texto do lead.
 *
 * Redis fora do ar → não deduplica (processa). Arriscar mensagem duplicada é
 * melhor que engolir a mensagem do lead por causa de cache indisponível.
 */
export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  try {
    const claimed = await redis.set(`seen:${messageId}`, '1', 'EX', SEEN_TTL_SECONDS, 'NX');
    return claimed === null;
  } catch (err) {
    logger.warn('message dedupe check failed, processing anyway', {
      messageId,
      errorMessage: (err as Error).message,
    });
    return false;
  }
}
