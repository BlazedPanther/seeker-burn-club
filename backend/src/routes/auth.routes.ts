import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { db } from '../db/client.js';
import { authSessions } from '../db/schema.js';
import { generateChallenge, verifyAuth, revokeSession } from '../services/auth.service.js';
import { parseExpiresIn } from '../lib/time.js';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';

const isValidSolanaAddress = (addr: string) => {
  try { new PublicKey(addr); return true; } catch { return false; }
};

const challengeSchema = z.object({
  walletAddress: z.string().min(32).max(44).refine(isValidSolanaAddress, 'Invalid Solana address'),
});

const verifySchema = z.object({
  walletAddress: z.string().min(32).max(44).refine(isValidSolanaAddress, 'Invalid Solana address'),
  signature: z.string().min(64),
  nonce: z.string().min(16),
  deviceFingerprint: z.string().min(1).max(255),
});

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/v1/auth/challenge (rate-limited: 10/min per IP)
  fastify.post('/api/v1/auth/challenge', async (request, reply) => {
    const body = challengeSchema.parse(request.body);
    const ip = request.ip;

    // Per-IP rate limit on challenge generation to prevent table flooding
    try {
      const rateKey = `ratelimit:challenge:${ip}`;
      const count = await redis.eval(
        `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return c`,
        1,
        rateKey,
      ) as number;
      if (count > 10) {
        return reply.code(429).send({ error: 'RATE_LIMIT_EXCEEDED' });
      }
    } catch {
      // Redis down — fail closed to prevent challenge table flooding
      return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Rate limiting unavailable. Please retry.' });
    }

    const result = await generateChallenge(body.walletAddress, ip);
    return reply.code(200).send(result);
  });

  // POST /api/v1/auth/verify
  fastify.post('/api/v1/auth/verify', async (request, reply) => {
    const body = verifySchema.parse(request.body);
    const ip = request.ip;
    const userAgent = request.headers['user-agent'];

    // Per-IP rate limit on verify: 10/min (crypto + multiple DB writes)
    try {
      const rateKey = `ratelimit:auth-verify:${ip}`;
      const count = await redis.eval(
        `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return c`,
        1,
        rateKey,
      ) as number;
      if (count > 10) {
        return reply.code(429).send({ error: 'RATE_LIMIT_EXCEEDED' });
      }
    } catch {
      // Redis down — fail closed to prevent brute-force flooding
      return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Rate limiting unavailable. Please retry.' });
    }

    let result;
    try {
      result = await verifyAuth(
        body.walletAddress,
        body.signature,
        body.nonce,
        body.deviceFingerprint,
        ip,
        userAgent,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'UNKNOWN_ERROR';
      const code = msg === 'INVALID_NONCE' || msg === 'NONCE_ALREADY_USED' || msg === 'NONCE_EXPIRED'
        ? 400 : msg === 'INVALID_SIGNATURE' || msg === 'INVALID_SIGNATURE_FORMAT' ? 401 : 500;
      fastify.log.error({ err: e, wallet: body.walletAddress }, 'Auth verify failed');
      return reply.code(code).send({ error: msg });
    }

    // Sign JWT with Fastify
    const token = fastify.jwt.sign(
      { sub: body.walletAddress, device: body.deviceFingerprint },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    // Hash the actual JWT for session tracking
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    // Parse JWT_EXPIRES_IN (e.g., '24h', '7d') into milliseconds
    const expiresInMs = parseExpiresIn(env.JWT_EXPIRES_IN);
    await db.insert(authSessions).values({
      walletAddress: body.walletAddress,
      tokenHash,
      deviceFingerprint: body.deviceFingerprint,
      ipAddress: ip,
      userAgent,
      expiresAt: new Date(Date.now() + expiresInMs),
    });

    return reply.code(200).send({
      token,
      expiresAt: result.expiresAt,
      user: result.user,
    });
  });

  // POST /api/v1/auth/logout
  fastify.post('/api/v1/auth/logout', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    // Revoke only the current session, not all sessions for this wallet
    const rawToken = request.headers.authorization?.replace(/^bearer\s+/i, '');
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await revokeSession(tokenHash);
    }
    return reply.code(200).send({ success: true });
  });
}
