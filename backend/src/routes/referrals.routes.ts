import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { redis } from '../lib/redis.js';
import {
  applyReferralCode,
  getReferralHistory,
  getReferralOverview,
  isReferralCodeFormatValid,
} from '../services/referrals.service.js';

const applySchema = z.object({
  code: z.string().trim().min(4).max(20),
});

export async function referralsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/referrals/me
  fastify.get('/api/v1/referrals/me', async (request, reply) => {
    const wallet = request.user.sub;
    const overview = await getReferralOverview(wallet);
    return reply.code(200).send(overview);
  });

  // GET /api/v1/referrals/history
  fastify.get('/api/v1/referrals/history', async (request, reply) => {
    const wallet = request.user.sub;
    const history = await getReferralHistory(wallet);
    return reply.code(200).send({ history });
  });

  // POST /api/v1/referrals/apply
  fastify.post('/api/v1/referrals/apply', async (request, reply) => {
    const wallet = request.user.sub;
    const deviceFingerprint = request.user.device;
    const ip = request.ip;
    const parsed = applySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_REFERRAL_CODE_FORMAT' });
    }

    const code = parsed.data.code;
    if (!isReferralCodeFormatValid(code)) {
      return reply.code(400).send({ error: 'INVALID_REFERRAL_CODE_FORMAT' });
    }

    // Rate limit: 10 attempts/hour per wallet to slow brute-force code probing.
    try {
      const rateKey = `ratelimit:referral-apply:${wallet}`;
      const count = await redis.eval(
        `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], 3600) end; return c`,
        1,
        rateKey,
      ) as number;
      if (count > 10) return reply.code(429).send({ error: 'RATE_LIMIT_EXCEEDED' });
    } catch {
      // Redis down — fail closed to prevent brute-force code probing
      return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' });
    }

    try {
      const result = await applyReferralCode(wallet, code, deviceFingerprint, ip);
      return reply.code(200).send({ success: true, ...result });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'UNKNOWN_ERROR';
      const statusCode = (() => {
        switch (msg) {
          case 'INVALID_REFERRAL_CODE_FORMAT':
            return 400;
          case 'REFERRAL_ALREADY_APPLIED':
          case 'REFERRAL_SELF_NOT_ALLOWED':
          case 'REFERRAL_WINDOW_EXPIRED':
            return 409;
          case 'REFERRAL_CODE_INVALID':
            return 404;
          case 'REFERRAL_REJECTED_SYBIL':
            return 403;
          default:
            return 400;
        }
      })();
      return reply.code(statusCode).send({ error: msg });
    }
  });
}
