import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deposits, users } from '../db/schema.js';
import {
  connection, TREASURY_SKR_ATA, TOKEN_PROGRAM_ID,
  getUserSkrAta, SKR_MINT, getMintDecimals,
  parseUnits, formatUnits, addDecimalStrings,
} from '../lib/solana.js';
import { fetchTransactionWithRetry } from '../services/burn.service.js';
import { securityLog } from '../lib/security.js';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';
import { PublicKey } from '@solana/web3.js';

const submitSchema = z.object({
  signature: z.string().min(64).max(88),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid amount format'),
});

/**
 * Verify a deposit transaction: SPL transfer from user ATA to Treasury ATA.
 */
async function verifyDeposit(
  walletAddress: string,
  signature: string,
  claimedAmount: string,
): Promise<{ amountStr: string; decimals: number; slot: number; blockTime: number }> {
  // Use the same retry logic as burns: polls every 2s up to 8 attempts (~56s total)
  // so a tx that's still propagating is not immediately failed with TRANSACTION_NOT_FOUND.
  // Use 'confirmed' (not 'finalized') for speed — same reliability guarantee as the burn path.
  const tx = await fetchTransactionWithRetry(signature, { commitment: 'confirmed' });

  if (!tx) throw new Error('TRANSACTION_NOT_FOUND');
  if (tx.meta?.err) throw new Error('TRANSACTION_FAILED_ON_CHAIN');

  // Check replay
  const [existing] = await db
    .select({ id: deposits.id })
    .from(deposits)
    .where(eq(deposits.txSignature, signature))
    .limit(1);
  if (existing) throw new Error('DUPLICATE_SIGNATURE');

  let transferVerified = false;
  let actualAmount = BigInt(0);

  // Resolve all account keys including v0 address lookup tables
  const messageAccountKeys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
  });
  const accountKeys = messageAccountKeys.staticAccountKeys;
  const resolveKey = (index: number) => messageAccountKeys.get(index) ?? accountKeys[index];
  const instructions = tx.transaction.message.compiledInstructions
    ?? (tx.transaction.message as unknown as { instructions: typeof tx.transaction.message.compiledInstructions }).instructions;

  for (const ix of instructions) {
    const programId = resolveKey(ix.programIdIndex);
    if (programId?.equals(TOKEN_PROGRAM_ID)) {
      const data = Buffer.from(ix.data);
      if (data[0] === 3 || data[0] === 12) { // Transfer or TransferChecked
        // Transfer (3): [source, destination, authority]
        // TransferChecked (12): [source, mint, destination, authority]
        const accountIndices = ix.accountKeyIndexes;
        const source = resolveKey(accountIndices[0]!);
        const destination = data[0] === 12
          ? resolveKey(accountIndices[2]!)
          : resolveKey(accountIndices[1]!);
        const authority = data[0] === 12
          ? resolveKey(accountIndices[3]!)
          : resolveKey(accountIndices[2]!);

        const expectedSource = getUserSkrAta(walletAddress);
        if (
          source?.equals(expectedSource) &&
          destination?.equals(TREASURY_SKR_ATA) &&
          authority?.equals(new PublicKey(walletAddress))
        ) {
          actualAmount = data.readBigUInt64LE(1);
          transferVerified = true;
        }
      }
    }
  }

  if (!transferVerified) throw new Error('NO_TRANSFER_INSTRUCTION');

  const decimals = await getMintDecimals();
  const amountStr = formatUnits(actualAmount, decimals);

  // Verify claimed amount matches on-chain amount
  if (claimedAmount && claimedAmount !== '0') {
    const claimedBase = parseUnits(claimedAmount, decimals);
    if (actualAmount !== claimedBase) throw new Error('DEPOSIT_AMOUNT_MISMATCH');
  }

  // Verify blockTime present
  if (!tx.blockTime) throw new Error('MISSING_BLOCK_TIME');

  // Block time freshness check (same window as burns, one-directional)
  const now = Math.floor(Date.now() / 1000);
  if (now - tx.blockTime > env.TX_FRESHNESS_WINDOW) {
    securityLog({ eventType: 'DEPOSIT_TX_TOO_OLD', walletAddress, severity: 'WARN', details: { signature, blockTime: tx.blockTime, serverTime: now } });
    throw new Error('TRANSACTION_TOO_OLD');
  }
  if (tx.blockTime - now > 60) {
    securityLog({ eventType: 'DEPOSIT_TX_FUTURE', walletAddress, severity: 'WARN', details: { signature, blockTime: tx.blockTime, serverTime: now } });
    throw new Error('TRANSACTION_FROM_FUTURE');
  }

  return {
    amountStr,
    decimals,
    slot: tx.slot ?? 0,
    blockTime: tx.blockTime,
  };
}

export async function depositRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // POST /api/v1/deposit/submit
  fastify.post('/api/v1/deposit/submit', async (request, reply) => {
    const wallet = request.user.sub;
    const body = submitSchema.parse(request.body);

    // Per-wallet rate limit: max 5 deposit submissions per minute
    try {
      const walletRateKey = `ratelimit:deposit:${wallet}`;
      const count = await redis.eval(
        `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return c`,
        1,
        walletRateKey,
      ) as number;
      if (count > 5) {
        return reply.code(429).send({ error: 'RATE_LIMIT_EXCEEDED', message: 'Max 5 deposit submissions per minute per wallet.' });
      }
    } catch {
      // Redis unavailable — allow the request rather than blocking all deposits
    }

    try {
      const result = await verifyDeposit(wallet, body.signature, body.amount);

      // Get or create user
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.walletAddress, wallet))
        .limit(1);

      if (!user) {
        const [newUser] = await db
          .insert(users)
          .values({ walletAddress: wallet })
          .onConflictDoUpdate({
            target: users.walletAddress,
            set: { updatedAt: new Date() },
          })
          .returning();
        user = newUser!;
      }

      // Atomic: Record deposit + update user total in one transaction
      // Use advisory lock on BOTH signature (dedup) and wallet (totalDeposited race)
      // Use string math (same as burn.service) to avoid float precision loss
      const deposit = await db.transaction(async (tx) => {
        // Advisory lock on signature hash to prevent concurrent duplicate submissions
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${body.signature}))`);
        // Advisory lock on wallet to prevent concurrent totalDeposited updates
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${wallet}))`);

        // Re-check duplicate inside transaction (TOCTOU protection)
        const [dup] = await tx
          .select({ id: deposits.id })
          .from(deposits)
          .where(eq(deposits.txSignature, body.signature))
          .limit(1);
        if (dup) throw new Error('DUPLICATE_SIGNATURE');

        const [record] = await tx
          .insert(deposits)
          .values({
            userId: user.id,
            walletAddress: wallet,
            txSignature: body.signature,
            amount: result.amountStr,
            slot: result.slot,
            blockTime: new Date(result.blockTime * 1000),
            status: 'VERIFIED',
            verifiedAt: new Date(),
          })
          .returning();

        // Use SQL-level addition to prevent lost-update race on totalDeposited
        await tx.execute(sql`
          UPDATE users
          SET total_deposited = total_deposited + ${result.amountStr}::numeric,
              updated_at = NOW()
          WHERE id = ${user.id}
        `);

        return record!;
      });

      // Invalidate treasury cache
      await Promise.allSettled([
        redis.del('treasury:stats'),
        redis.del('global:stats'),
      ]);

      return reply.code(200).send({
        id: deposit.id,
        status: 'VERIFIED',
        signature: body.signature,
        amount: result.amountStr,
        submittedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
      // Only expose known, safe error codes to the client
      const KNOWN_ERRORS = new Set([
        'TRANSACTION_NOT_FOUND', 'TRANSACTION_FAILED_ON_CHAIN', 'DUPLICATE_SIGNATURE',
        'NO_TRANSFER_INSTRUCTION', 'DEPOSIT_AMOUNT_MISMATCH', 'MISSING_BLOCK_TIME',
        'TRANSACTION_TOO_OLD',
      ]);
      if (KNOWN_ERRORS.has(rawMessage)) {
        return reply.code(400).send({ error: rawMessage });
      }
      fastify.log.error({ err, wallet }, 'Unexpected deposit submission error');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/v1/deposit/history
  fastify.get('/api/v1/deposit/history', async (request, reply) => {
    const wallet = request.user.sub;
    const { page = '1', limit = '20' } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [depositList, [countRow]] = await Promise.all([
      db
        .select()
        .from(deposits)
        .where(eq(deposits.walletAddress, wallet))
        .orderBy(desc(deposits.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deposits)
        .where(eq(deposits.walletAddress, wallet)),
    ]);
    const total = countRow?.count ?? 0;

    return reply.code(200).send({
      deposits: depositList.map(d => ({
        id: d.id,
        signature: d.txSignature,
        amount: d.amount,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        hasMore: offset + depositList.length < total,
      },
    });
  });
}
