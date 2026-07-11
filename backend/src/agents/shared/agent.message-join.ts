import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';

/**
 * Anti-flood join: pushes the message, waits AGENT_MESSAGE_WAIT_MS, then
 * checks whether it's still the last message queued for this remoteJid.
 * If a newer message arrived meanwhile, this invocation stands down —
 * the invocation holding the newest message is the one that proceeds.
 */
export async function joinMessages(remoteJid: string, message: string): Promise<string | null> {
  await redis.rpush(remoteJid, message);
  await new Promise((resolve) => setTimeout(resolve, env.AGENT_MESSAGE_WAIT_MS));

  const all = await redis.lrange(remoteJid, 0, -1);
  const last = all[all.length - 1];

  if (last !== message) return null;

  await redis.del(remoteJid);
  return all.join(' ');
}
