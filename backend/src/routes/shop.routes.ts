/**
 * Shield Shop routes — purchase streak shields with SKR.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { getShieldPacks, verifyShieldPurchase, generatePriceQuote, MAX_SHIELDS, type PriceQuote } from '../services/shop.service.js';

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
}
