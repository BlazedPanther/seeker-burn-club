import Redis from 'ioredis';
import { env } from '../config/env.js';
import pino from 'pino';

const logger = pino({ name: 'redis' });

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});
