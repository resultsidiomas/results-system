import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import type { ChatMessage } from './agent.types.js';

function sessionKey(instance: string, remoteJid: string): string {
  return `chat:${instance}${remoteJid}`;
}

export async function appendChatMessage(
  instance: string,
  remoteJid: string,
  message: ChatMessage,
): Promise<void> {
  const key = sessionKey(instance, remoteJid);
  await redis.rpush(key, JSON.stringify(message));
  // Keep last N exchanges (pairs), i.e. N*2 messages.
  await redis.ltrim(key, -env.AGENT_HISTORY_LIMIT * 2, -1);
}
