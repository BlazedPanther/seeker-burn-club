/**
 * Streak Shield Shop service.
 *
 * Shield packs:
 *  - 1 shield  = ~$2 in SOL (transferred to treasury)
 *  - 3 shields = ~$5 in SOL
 *  - 7 shields = ~$10 in SOL
 *
 * Dual currency: SOL or SEEKER (SKR) token.
 * SKR purchases get a 10% discount.
 *
 * Purchase flow:
 *  1. Client fetches current prices (GET /api/v1/shop/shields)
 *  2. Client builds SOL transfer OR SPL token transfer tx, signs & broadcasts
 *  3. Client submits signature + currency to POST /api/v1/shop/shields/purchase
 *  4. Backend verifies on-chain transfer amount to treasury
 *  5. Shields credited to user
 *
 * Max holdable shields: 10
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, shieldPurchases } from '../db/schema.js';
import { connection, getMintDecimals } from '../lib/solana.js';
import { env } from '../config/env.js';
import { securityLog } from '../lib/security.js';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { fetchTransactionWithRetry } from './burn.service.js';
import { grantXp } from './xp.service.js';
import { getTokenPrices, type TokenPrices } from '../lib/price.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_SHIELDS = 10;
const SKR_DISCOUNT = 0.10; // 10% discount when paying with SKR
const PRICE_TOLERANCE = 0.15; // 15% tolerance for price volatility
const QUOTE_TTL_MS = 5 * 60 * 1000; // 5 min quote validity

// ── Price quote signing (HMAC-SHA256) ──

function getQuoteSecret(): string {
  // Reuse JWT_SECRET for HMAC — it's already a long random secret
  return env.JWT_SECRET;
}

/** Sign a price quote so it can't be forged by the client. */
function signQuote(payload: string): string {
  return createHmac('sha256', getQuoteSecret()).update(payload).digest('hex');
}

export interface PriceQuote {
  /** JSON payload: packId → { priceLamports, priceSkrBaseUnits } */
  payload: string;
  signature: string;
}

/** Generate a signed price quote for the current pack prices. */
export function generatePriceQuote(packs: ShieldPack[]): PriceQuote {
  const quoteData: Record<string, { priceLamports: number; priceSkrBaseUnits: string; ts: number }> = {};
  const ts = Date.now();
  for (const p of packs) {
    quoteData[p.id] = { priceLamports: p.priceLamports, priceSkrBaseUnits: p.priceSkrBaseUnits, ts };
  }
  const payload = JSON.stringify(quoteData);
  return { payload, signature: signQuote(payload) };
}

/** Verify a signed price quote. Returns the locked prices or null if invalid/expired. */
function verifyPriceQuote(
  quote: PriceQuote | undefined,
  packId: string,
): { priceLamports: number; priceSkrBaseUnits: string } | null {
  if (!quote?.payload || !quote?.signature) return null;
  const expected = signQuote(quote.payload);
  // Constant-time comparison to prevent timing attacks
  if (
    expected.length !== quote.signature.length ||
    !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(quote.signature, 'hex'))
  ) {
    return null;
  }
  try {
    const data = JSON.parse(quote.payload) as Record<string, { priceLamports: number; priceSkrBaseUnits: string; ts: number }>;
    const entry = data[packId];
    if (!entry) return null;
    if (Date.now() - entry.ts > QUOTE_TTL_MS) return null;
    return { priceLamports: entry.priceLamports, priceSkrBaseUnits: entry.priceSkrBaseUnits };
  } catch {
    return null;
  }
}

export type ShopCurrency = 'SOL' | 'SKR';

export interface ShieldPack {
  id: string;
  shields: number;
  priceUsd: number;
  priceLamports: number;
  priceSkrUsd: number;        // USD price after 10% SKR discount
  priceSkrBaseUnits: string;  // SKR amount in base units (string for precision)
}

/**
 * Get available shield packs with current SOL and SKR prices.
 * Prices are fetched from Jupiter (cached 5 min) with env fallback.
 */
export async function getShieldPacks(): Promise<{ packs: ShieldPack[]; prices: TokenPrices }> {
  const prices = await getTokenPrices();
  const solPriceUsd = prices.solUsd;
  const skrPriceUsd = prices.skrUsd;

  const skrDecimals = await getMintDecimals();
  const skrBaseUnits = 10 ** skrDecimals;

  const packs = [
    { id: 'shield_1', shields: 1, priceUsd: 2.00 },
    { id: 'shield_3', shields: 3, priceUsd: 5.00 },
    { id: 'shield_7', shields: 7, priceUsd: 10.00 },
  ];

  return {
    packs: packs.map(p => {
      const skrDiscountedUsd = +(p.priceUsd * (1 - SKR_DISCOUNT)).toFixed(2);
      return {
        ...p,
        priceLamports: Math.ceil((p.priceUsd / solPriceUsd) * LAMPORTS_PER_SOL),
        priceSkrUsd: skrDiscountedUsd,
        priceSkrBaseUnits: Math.ceil((skrDiscountedUsd / skrPriceUsd) * skrBaseUnits).toString(),
      };
    }),
    prices,
  };
}

export interface ShieldPurchaseResult {
  purchaseId: string;
  shieldsAdded: number;
  totalShields: number;
  status: string;
}

/**
 * Verify a shield purchase transaction and credit shields.
 * Supports both SOL (native transfer) and SKR (SPL token transfer).
 *
 * If a signed price quote is provided, the LOCKED prices from the quote are
 * used for verification (protecting against price race conditions). Otherwise
 * falls back to current live prices.
 */
export async function verifyShieldPurchase(
  walletAddress: string,
  signature: string,
  packId: string,
  currency: ShopCurrency = 'SOL',
  priceQuote?: PriceQuote,
): Promise<ShieldPurchaseResult> {
  const { packs } = await getShieldPacks();
  const pack = packs.find(p => p.id === packId);
  if (!pack) throw new Error('INVALID_PACK_ID');

  // Use locked prices from quote if valid, otherwise use current live prices
  const lockedPrices = verifyPriceQuote(priceQuote, packId);
  const verifyPriceLamports = lockedPrices?.priceLamports ?? pack.priceLamports;
  const verifyPriceSkrBaseUnits = lockedPrices?.priceSkrBaseUnits ?? pack.priceSkrBaseUnits;

  // Fetch transaction
  const tx = await fetchTransactionWithRetry(signature);
  if (!tx) throw new Error('TRANSACTION_NOT_FOUND');
  if (tx.meta?.err) throw new Error('TRANSACTION_FAILED_ON_CHAIN');

  const treasuryKey = new PublicKey(env.TREASURY_WALLET);
  const walletKey = new PublicKey(walletAddress);

  const messageAccountKeys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
  });

  let transferVerified = false;
  let actualAmount = BigInt(0);

  const instructions = tx.transaction.message.compiledInstructions
    ?? (tx.transaction.message as unknown as { instructions: typeof tx.transaction.message.compiledInstructions }).instructions;

  if (currency === 'SKR') {
    // Verify SPL token transfer to treasury ATA
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const treasuryAta = new PublicKey(env.TREASURY_SKR_ATA);

    for (const ix of instructions) {
      const programId = messageAccountKeys.get(ix.programIdIndex);
      if (!programId?.equals(TOKEN_PROGRAM_ID)) continue;

      const data = Buffer.from(ix.data);
      // SPL Transfer instruction type = 3
      if (data.length >= 9 && data[0] === 3) {
        const amount = data.readBigUInt64LE(1);
        const dest = messageAccountKeys.get(ix.accountKeyIndexes[1]!);
        const owner = messageAccountKeys.get(ix.accountKeyIndexes[2]!);

        if (dest?.equals(treasuryAta) && owner?.equals(walletKey)) {
          actualAmount = amount;
          transferVerified = true;
        }
      }
    }

    if (!transferVerified) {
      securityLog({ eventType: 'SHIELD_NO_SKR_TRANSFER', walletAddress, severity: 'WARN', details: { signature } });
      throw new Error('NO_TREASURY_TRANSFER');
    }

    const requiredBig = BigInt(verifyPriceSkrBaseUnits);
    const minRequired = requiredBig * BigInt(Math.round((1 - PRICE_TOLERANCE) * 100)) / 100n;
    if (actualAmount < minRequired) {
      securityLog({ eventType: 'SHIELD_SKR_AMOUNT_LOW', walletAddress, severity: 'WARN', details: { signature, actual: actualAmount.toString(), required: verifyPriceSkrBaseUnits } });
      throw new Error('INSUFFICIENT_PAYMENT');
    }
  } else {
    // Verify SOL (native) transfer to treasury
    for (const ix of instructions) {
      const programId = messageAccountKeys.get(ix.programIdIndex);
      if (!programId?.equals(SystemProgram.programId)) continue;

      const data = Buffer.from(ix.data);
      if (data.length >= 12 && data.readUInt32LE(0) === 2) {
        const lamports = data.readBigUInt64LE(4);
        const from = messageAccountKeys.get(ix.accountKeyIndexes[0]!);
        const to = messageAccountKeys.get(ix.accountKeyIndexes[1]!);

        if (from?.equals(walletKey) && to?.equals(treasuryKey)) {
          actualAmount = lamports;
          transferVerified = true;
        }
      }
    }

    if (!transferVerified) {
      securityLog({ eventType: 'SHIELD_NO_TRANSFER', walletAddress, severity: 'WARN', details: { signature } });
      throw new Error('NO_TREASURY_TRANSFER');
    }

    const minRequired = BigInt(Math.round(verifyPriceLamports * (1 - PRICE_TOLERANCE)));
    if (actualAmount < minRequired) {
      securityLog({ eventType: 'SHIELD_AMOUNT_LOW', walletAddress, severity: 'WARN', details: { signature, actual: actualAmount.toString(), required: verifyPriceLamports.toString() } });
      throw new Error('INSUFFICIENT_PAYMENT');
    }
  }

  // Get or create user
  const [user] = await db
    .select({ id: users.id, streakShields: users.streakShields })
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);
  if (!user) throw new Error('USER_NOT_FOUND');

  if (user.streakShields + pack.shields > MAX_SHIELDS) {
    throw new Error('MAX_SHIELDS_EXCEEDED');
  }

  // Atomic: insert purchase + credit shields
  const result = await db.transaction(async (txn) => {
    // Advisory lock on wallet to prevent concurrent purchases
    await txn.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${walletAddress}))`);

    // Duplicate check
    const [dupe] = await txn
      .select({ id: shieldPurchases.id })
      .from(shieldPurchases)
      .where(eq(shieldPurchases.txSignature, signature))
      .limit(1);
    if (dupe) throw new Error('DUPLICATE_PURCHASE');

    // Re-check shield count under lock
    const [lockedUser] = await txn
      .select({ streakShields: users.streakShields })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!lockedUser) throw new Error('USER_NOT_FOUND');
    if (lockedUser.streakShields + pack.shields > MAX_SHIELDS) {
      throw new Error('MAX_SHIELDS_EXCEEDED');
    }

    const [purchase] = await txn.insert(shieldPurchases).values({
      userId: user.id,
      walletAddress,
      txSignature: signature,
      shieldCount: pack.shields,
      priceLamports: actualAmount.toString(),
      priceUsd: (currency === 'SKR' ? pack.priceSkrUsd : pack.priceUsd).toString(),
      currency,
      status: 'VERIFIED',
      verifiedAt: new Date(),
    }).returning({ id: shieldPurchases.id });

    const [updated] = await txn
      .update(users)
      .set({
        streakShields: sql`${users.streakShields} + ${pack.shields}`,
        // Also keep legacy streakShieldActive in sync
        streakShieldActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning({ streakShields: users.streakShields });

    return {
      purchaseId: purchase!.id,
      shieldsAdded: pack.shields,
      totalShields: updated!.streakShields,
    };
  });

  securityLog({ eventType: 'SHIELD_PURCHASED', walletAddress, severity: 'INFO', details: { signature, packId, shields: pack.shields, currency } });

  return { ...result, status: 'VERIFIED' };
}
