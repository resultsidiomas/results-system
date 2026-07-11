import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../shared/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: (times: number) => Math.min(times * 200, 5000),
});

// Redis down at boot must not crash the process — connection errors
// only matter once an agent flow actually tries to use it.
redis.on('error', (err: Error) => {
  logger.error('redis connection error', { errorMessage: err.message });
});
