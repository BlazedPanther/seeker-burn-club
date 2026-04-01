import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { burns } from '../db/schema.js';
import { verifyAndRecordBurn } from '../services/burn.service.js';
import { todayUTC } from '../lib/solana.js';
import { redis } from '../lib/redis.js';

const submitSchema = z.object({
  signature: z.string().min(64).max(88),
  burnAmount: z.string().regex(/^(0(\.\d+)?|[1-9]\d*(\.\d+)?)$/, 'Invalid burn amount format'),
  feeAmount: z.string().regex(/^(0(\.\d+)?|[1-9]\d*(\.\d+)?)$/, 'Invalid fee amount format'),
});

export async function burnRoutes(fastify: FastifyInstance) {
  // All burn routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // POST /api/v1/burn/submit
  fastify.post('/api/v1/burn/submit', async (request, reply) => {
    const wallet = request.user.sub;
    const body = submitSchema.parse(request.body);
    const ip = request.ip;
    const device = request.user.device;

    // Per-wallet rate limit: max 3 burn submissions per minute
    // Atomic Lua script — avoids INCR/EXPIRE race and degrades gracefully if Redis is down
    try {
      const walletRateKey = `ratelimit:burn:${wallet}`;
      const count = await redis.eval(
        `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return c`,
        1,
        walletRateKey,
      ) as number;
      if (count > 3) {
        return reply.code(429).send({ error: 'RATE_LIMIT_EXCEEDED', message: 'Max 3 burn submissions per minute per wallet.' });
      }
    } catch {
      // Redis unavailable — allow the request rather than blocking all burns
    }

    try {
      const result = await verifyAndRecordBurn(
        wallet,
        body.signature,
        body.burnAmount,
        body.feeAmount,
        device,
        ip,
      );

      return reply.code(200).send({
        id: result.burnId,
        status: result.status,
        signature: body.signature,
        newStreak: result.newStreak,
        longestStreak: result.longestStreak,
        lifetimeBurned: result.lifetimeBurned,
        badgesEarned: result.badgesEarned,
        xpEarned: result.xpEarned,
        totalXp: result.totalXp,
        level: result.level,
        levelTitle: result.levelTitle,
        leveledUp: result.leveledUp,
        shieldsAwarded: result.shieldsAwarded,
        luckyDrop: result.luckyDrop ?? null,
        luckyDropsToday: result.luckyDropsToday,
        maxDailyLuckyDrops: result.maxDailyLuckyDrops,
        challengeResults: result.challengeResults ?? null,
        submittedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
      // Only expose known, safe error codes to the client
      const KNOWN_ERRORS = new Set([
        'TRANSACTION_NOT_FOUND', 'TRANSACTION_FAILED_ON_CHAIN', 'DUPLICATE_SIGNATURE',
        'CANNOT_PARSE_INSTRUCTIONS', 'WRONG_MINT', 'WRONG_AUTHORITY', 'WRONG_SOURCE_ACCOUNT',
        'MALFORMED_BURN_INSTRUCTION', 'NO_BURN_INSTRUCTION', 'BURN_AMOUNT_TOO_LOW',
        'BURN_AMOUNT_MISMATCH', 'FEE_NOT_FOUND', 'FEE_AMOUNT_MISMATCH', 'FEE_TOO_LOW',
        'MISSING_BLOCK_TIME', 'ALREADY_BURNED_TODAY', 'TRANSACTION_TOO_OLD',
        'RATE_LIMIT_EXCEEDED',
      ]);
      if (KNOWN_ERRORS.has(rawMessage)) {
        return reply.code(400).send({ error: rawMessage });
      }
      fastify.log.error({ err, wallet }, 'Unexpected burn submission error');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/v1/burn/status/:signature
  //
  // If the burn is not yet in the DB (e.g. initial submit failed while tx was
  // still propagating), the client can pass ?retryVerify=true to trigger an
  // on-chain re-verification attempt. This makes polling a true safety net:
  // even if the original POST /burn/submit never succeeded, the pending screen
  // will eventually record the burn.
  fastify.get('/api/v1/burn/status/:signature', async (request, reply) => {
    const wallet = request.user.sub;
    const { signature } = z.object({ signature: z.string().min(64).max(88) }).parse(request.params);
    const { retryVerify } = (request.query as Record<string, string>);

    let [burn] = await db
      .select()
      .from(burns)
      .where(eq(burns.txSignature, signature))
      .limit(1);

    // If not in DB and client asked for retry verification, attempt on-chain verify now.
    if (!burn && retryVerify === 'true') {
      try {
        // Re-use the same submit logic — DUPLICATE_SIGNATURE guard makes this safe.
        // We pass "0" amounts because verifyAndRecordBurn validates against on-chain
        // data; the claimed amounts are re-derived inside. However, the current
        // implementation compares claimed vs actual, so we need the client to
        // supply them. For the retry path we skip the amount mismatch checks by
        // passing the special sentinel values that tell the verifier to accept
        // whatever is on-chain.
        //
        // Instead: just refetch and let the caller supply amounts via the body.
        // For a GET-based retry we do a lightweight "does the tx exist on-chain?" check
        // and return a hint so the client can re-POST /burn/submit with full params.
        const { connection } = await import('../lib/solana.js');
        const tx = await connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (tx && !tx.meta?.err) {
          // Verify that the authenticated wallet is the fee-payer of this transaction
          // before revealing its status. The fee-payer is always the first static account key.
          const feePayer = tx.transaction.message.getAccountKeys({
            accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
          }).staticAccountKeys[0];
          if (!feePayer || feePayer.toBase58() !== wallet) {
            return reply.code(403).send({ error: 'FORBIDDEN' });
          }
          // Transaction exists and succeeded on-chain but wasn't recorded yet.
          // Tell the client to re-POST /burn/submit.
          return reply.code(202).send({
            status: 'ON_CHAIN_NOT_RECORDED',
            signature,
            message: 'Transaction confirmed on-chain but not yet recorded. Re-submit to /burn/submit.',
          });
        } else if (tx && tx.meta?.err) {
          return reply.code(200).send({ status: 'FAILED', signature });
        }
        // tx still null — genuinely not found yet
        return reply.code(404).send({ error: 'BURN_NOT_FOUND' });
      } catch (err) {
        fastify.log.warn({ err, signature }, 'retryVerify RPC check failed');
        return reply.code(404).send({ error: 'BURN_NOT_FOUND' });
      }
    }

    if (!burn) {
      return reply.code(404).send({ error: 'BURN_NOT_FOUND' });
    }

    // Verify the requesting user owns this burn
    if (burn.walletAddress !== wallet) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }

    // Resolve badge name from definitions if badge was earned
    const badgeEarned = burn.badgeEarnedId
      ? { id: burn.badgeEarnedId, name: burn.badgeEarnedId, nftMintAddress: burn.nftMintAddress ?? null }
      : null;

    return reply.code(200).send({
      id: burn.id,
      status: burn.status,
      signature: burn.txSignature,
      burnAmount: burn.burnAmount,
      feeAmount: burn.feeAmount,
      slot: burn.slot,
      blockTime: Math.floor(burn.blockTime.getTime() / 1000),
      newStreak: burn.streakDay,
      badgeEarned,
      verifiedAt: burn.verifiedAt?.toISOString(),
    });
  });

  // GET /api/v1/burn/today
  fastify.get('/api/v1/burn/today', async (request, reply) => {
    const wallet = request.user.sub;
    const today = todayUTC();

    const [burn] = await db
      .select({ id: burns.id })
      .from(burns)
      .where(
        and(
          eq(burns.walletAddress, wallet),
          eq(burns.burnDate, today),
          eq(burns.status, 'VERIFIED'),
        )
      )
      .limit(1);

    return reply.code(200).send({ burnedToday: !!burn });
  });

  // GET /api/v1/burn/history
  fastify.get('/api/v1/burn/history', async (request, reply) => {
    const wallet = request.user.sub;
    const { page = '1', limit = '20' } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [burnList, [countRow]] = await Promise.all([
      db
        .select()
        .from(burns)
        .where(eq(burns.walletAddress, wallet))
        .orderBy(desc(burns.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(burns)
        .where(eq(burns.walletAddress, wallet)),
    ]);
    const total = countRow?.count ?? 0;

    return reply.code(200).send({
      burns: burnList.map(b => ({
        id: b.id,
        signature: b.txSignature,
        burnAmount: b.burnAmount,
        feeAmount: b.feeAmount,
        streakDay: b.streakDay,
        status: b.status,
        createdAt: b.createdAt.toISOString(),
        badgeEarned: b.badgeEarnedId ? { id: b.badgeEarnedId, name: b.badgeEarnedId } : null,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        hasMore: offset + burnList.length < total,
      },
    });
  });
}
