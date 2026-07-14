import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';

function blockKey(remoteJid: string): string {
  return `${remoteJid}_block`;
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
