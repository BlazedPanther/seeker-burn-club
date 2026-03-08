import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';

import crypto from 'node:crypto';

import { env } from './config/env.js';
import { redis } from './lib/redis.js';
import { db, closeDb } from './db/client.js';
import { authSessions } from './db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { authRoutes } from './routes/auth.routes.js';
import { burnRoutes } from './routes/burn.routes.js';
import { profileRoutes } from './routes/profile.routes.js';
import { leaderboardRoutes } from './routes/leaderboard.routes.js';
import { badgesRoutes, perksRoutes, badgeAssetRoutes } from './routes/badges-perks.routes.js';
import { treasuryRoutes } from './routes/treasury.routes.js';
import { depositRoutes } from './routes/deposit.routes.js';
import { referralsRoutes } from './routes/referrals.routes.js';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs/scheduler.js';

// -- Extend Fastify types for JWT auth --
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; device: string };
    user: { sub: string; device: string };
  }
}

async function buildServer() {
  // Safely resolve pino-pretty transport (devDependency - may not be installed)
  let transport: { target: string } | undefined;
  if (env.NODE_ENV !== 'production') {
    try {
      require.resolve('pino-pretty');
      transport = { target: 'pino-pretty' };
    } catch {
      // pino-pretty not installed - use default JSON logger
    }
  }

  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport,
    },
    trustProxy: true,
    bodyLimit: 256 * 1024, // 256 KB - sufficient for all JSON payloads
  });

  // -- Plugins --

  await fastify.register(helmet);

  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? ['https://seekerburnclub.xyz', 'https://www.seekerburnclub.xyz']
      : true,
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
  });

  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // -- Auth decorator --

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();

      // Verify session has not been revoked (with Redis cache to reduce DB load)
      const rawToken = request.headers.authorization?.replace(/^bearer\s+/i, '');
      if (!rawToken) {
        return reply.code(401).send({ error: 'UNAUTHORIZED' });
      }
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Check Redis cache first (30s TTL) to avoid hitting Postgres on every request
      const cacheKey = `session:${tokenHash}`;
      let sessionStatus: string | null = null;
      try {
        sessionStatus = await redis.get(cacheKey);
      } catch { /* Redis down - fall through to DB */ }

      if (sessionStatus === 'revoked') {
        return reply.code(401).send({ error: 'SESSION_REVOKED' });
      }

      if (!sessionStatus) {
        // Cache miss - query DB
        const [session] = await db
          .select({ revokedAt: authSessions.revokedAt })
          .from(authSessions)
          .where(eq(authSessions.tokenHash, tokenHash))
          .limit(1);

        if (!session) {
          return reply.code(401).send({ error: 'SESSION_NOT_FOUND' });
        }
        if (session.revokedAt) {
          try { await redis.setex(cacheKey, 30, 'revoked'); } catch { /* Redis down */ }
          return reply.code(401).send({ error: 'SESSION_REVOKED' });
        }

        // Cache valid session for 30s
        try { await redis.setex(cacheKey, 30, 'valid'); } catch { /* Redis down */ }
      }
    } catch (err) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
  });

  // -- Error handler --

  fastify.setErrorHandler((error: Error & { statusCode?: number; issues?: unknown[] }, request, reply) => {
    // Zod validation errors
    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: error.issues,
      });
    }

    fastify.log.error(error);

    const statusCode = error.statusCode ?? 500;
    // Never leak internal error details in production for 5xx errors
    const message = statusCode >= 500
      ? 'INTERNAL_SERVER_ERROR'
      : (error.message || 'INTERNAL_SERVER_ERROR');
    return reply.code(statusCode).send({
      error: message,
    });
  });

  // -- Health check (verifies DB + Redis connectivity) --

  fastify.get('/health', async (_request, reply) => {
    const checks: Record<string, string> = { status: 'ok', timestamp: new Date().toISOString() };
    let healthy = true;

    // Check Postgres
    try {
      await db.execute(sql`SELECT 1`);
      checks.db = 'ok';
    } catch {
      checks.db = 'error';
      healthy = false;
    }

    // Check Redis
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      healthy = false;
    }

    checks.status = healthy ? 'ok' : 'degraded';
    return reply.code(healthy ? 200 : 503).send(checks);
  });

  // -- Routes --

  await fastify.register(authRoutes);
  await fastify.register(badgeAssetRoutes); // public badge assets (no auth)
  await fastify.register(burnRoutes);
  await fastify.register(depositRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(leaderboardRoutes);
  await fastify.register(badgesRoutes);
  await fastify.register(perksRoutes);
  await fastify.register(referralsRoutes);
  await fastify.register(treasuryRoutes);

  return fastify;
}

// -- Start --

async function start() {
  // -- Startup validation --
  if (env.BADGE_COLLECTION_MINT && !env.MINT_AUTHORITY_SECRET_KEY) {
    console.error(
      'FATAL: BADGE_COLLECTION_MINT is set but MINT_AUTHORITY_SECRET_KEY is missing. ' +
      'NFT badge minting will fail at runtime. Provide the key or remove BADGE_COLLECTION_MINT.',
    );
    process.exit(1);
  }

  const server = await buildServer();

  // -- Graceful shutdown --
  const shutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down gracefully...`);
    stopBackgroundJobs();
    await server.close();
    // Close Redis and DB pool
    try { await redis.quit(); } catch { /* ignore */ }
    try { await closeDb(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await server.listen({
      port: env.PORT,
      host: env.HOST,
    });
    server.log.info(`Server listening on ${env.HOST}:${env.PORT}`);
    startBackgroundJobs(server.log);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();


