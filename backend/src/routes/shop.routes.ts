/**
 * Shield Shop routes — purchase streak shields with SKR.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { getShieldPacks, verifyShieldPurchase, generatePriceQuote, MAX_SHIELDS, type PriceQuote } from '../services/shop.service.js';
import { securityLog } from '../lib/security.js';

export async function shopRoutes(fastify: FastifyInstance) {
  // GET /api/v1/shop/shields — available shield packs + prices (public)
  fastify.get('/api/v1/shop/shields', async (_request, reply) => {
    const { packs, prices } = await getShieldPacks();
    const quote = generatePriceQuote(packs);
    return reply.code(200).send({
      packs,
      maxShields: MAX_SHIELDS,
      priceSource: prices.source,
      skrUsd: prices.skrUsd,
      priceQuote: quote,
    });
  });

  const purchaseSchema = z.object({
    signature: z.string().min(1),
    packId: z.string().min(1),
    priceQuote: z.object({
      payload: z.string(),
      signature: z.string(),
    }).optional(),
  });

  // POST /api/v1/shop/shields/purchase — verify SKR transfer + credit shields
  fastify.post('/api/v1/shop/shields/purchase', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const wallet = request.user.sub;
    const parsed = purchaseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_REQUEST', details: parsed.error.issues });
    }
    const { signature, packId, priceQuote } = parsed.data;

    try {
      const result = await verifyShieldPurchase(wallet, signature, packId, priceQuote);
      return reply.code(200).send(result);
    } catch (err: unknown) {
      const message = (err as Error).message;
      const clientErrors = [
        'INVALID_PACK_ID', 'TRANSACTION_NOT_FOUND', 'TRANSACTION_FAILED_ON_CHAIN',
        'NO_TREASURY_TRANSFER', 'INSUFFICIENT_PAYMENT', 'MAX_SHIELDS_EXCEEDED',
        'DUPLICATE_PURCHASE', 'USER_NOT_FOUND',
      ];
      if (clientErrors.includes(message)) {
        return reply.code(400).send({ error: message });
      }
      throw err;
    }
  });

  // GET /api/v1/shop/shields/balance — current shield count
  fastify.get('/api/v1/shop/shields/balance', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const wallet = request.user.sub;
    const [user] = await db
      .select({ streakShields: users.streakShields })
      .from(users)
      .where(eq(users.walletAddress, wallet))
      .limit(1);

    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    return reply.code(200).send({
      shields: user.streakShields,
      maxShields: MAX_SHIELDS,
    });
  });

  // POST /api/v1/shields/recover — manually use shields to recover a broken streak
  fastify.post('/api/v1/shields/recover', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const wallet = request.user.sub;

    // Atomic recovery: consume shields, clear recovery window, preserve streak
    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.walletAddress, wallet))
        .limit(1);

      if (!user) return { error: 'USER_NOT_FOUND' as const };

      if (!user.streakRecoveryDeadline || new Date(user.streakRecoveryDeadline) <= new Date()) {
        return { error: 'NO_RECOVERY_WINDOW' as const };
      }

      const gapDays = user.streakRecoveryGapDays ?? 0;
      if (gapDays <= 0) return { error: 'NO_RECOVERY_WINDOW' as const };

      if (user.streakShields < gapDays) {
        return { error: 'NOT_ENOUGH_SHIELDS' as const };
      }

      // Consume shields and clear recovery state
      // Set last_burn_date to yesterday so next burn continues the streak
      const yesterday = sql`(CURRENT_DATE AT TIME ZONE 'UTC' - INTERVAL '1 day')::date::text`;
      await tx
        .update(users)
        .set({
          streakShields: user.streakShields - gapDays,
          streakShieldActive: user.streakShields - gapDays > 0,
          streakRecoveryDeadline: null,
          streakRecoveryGapDays: 0,
          lastBurnDate: sql`${yesterday}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return {
        ok: true as const,
        shieldsConsumed: gapDays,
        shieldsRemaining: user.streakShields - gapDays,
        currentStreak: user.currentStreak,
      };
    });

    if ('error' in result) {
      const code = result.error === 'USER_NOT_FOUND' ? 404 : 400;
      return reply.code(code).send({ error: result.error });
    }

    securityLog({
      eventType: 'STREAK_SHIELD_MANUAL_RECOVER',
      severity: 'INFO',
      walletAddress: wallet,
      details: { shieldsConsumed: result.shieldsConsumed, streak: result.currentStreak },
    });

    return reply.code(200).send(result);
  });
}
