import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, burns, badges } from '../db/schema.js';
import {
  connection, SKR_MINT, TREASURY_SKR_ATA, TOKEN_PROGRAM_ID,
  getUserSkrAta, getMintDecimals, parseUnits, formatUnits,
  addDecimalStrings, getUTCDateString, yesterdayUTC,
} from '../lib/solana.js';
import { checkMilestones, type BadgeDefinition } from '../lib/badges.js';
import { securityLog } from '../lib/security.js';
import { redis } from '../lib/redis.js';
import { PublicKey } from '@solana/web3.js';
import { env } from '../config/env.js';
import { evaluateReferralQualification } from './referrals.service.js';
import { grantBurnXp, grantBadgeXp, levelFromXp, getLevelTitle } from './xp.service.js';
import { evaluateChallenges, recheckDailySweep, type ChallengeResult, type BurnContext } from './challenges.service.js';
import { rollLuckyDrop, consumeXpBoost, consumeGoldenBurn, type LuckyDropResult } from './lucky.service.js';

export interface VerificationResult {
  verified: boolean;
  burnAmount: bigint;
  feeAmount: bigint;
  slot: number;
  blockTime: number;
  burnDate: string;
}

export interface BurnResult {
  burnId: string;
  status: string;
  newStreak: number;
  longestStreak: number;
  lifetimeBurned: string;
  badgesEarned: Array<{ id: string; name: string }>;
  xpEarned: number;
  totalXp: number;
  level: number;
  levelTitle: string;
  leveledUp: boolean;
  shieldsAwarded: number;
  challengeResults?: ChallengeResult;
  luckyDrop?: LuckyDropResult;
  luckyDropsToday: number;
  maxDailyLuckyDrops: number;
}

/**
 * Helper: fetch a transaction from RPC with internal retry.
 * After signAndSendTransaction the tx may not be available for several seconds.
 * We poll with exponential back-off (confirmed commitment is faster than finalized
 * and still >99.9 % reliable) so the caller never sees TRANSACTION_NOT_FOUND for
 * a transaction that is simply still propagating.
 */
export async function fetchTransactionWithRetry(
  signature: string,
  {
    maxAttempts = 12,
    baseDelayMs = 2_000,
    commitment = 'confirmed' as const,
  } = {},
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tx = await connection.getTransaction(signature, {
      commitment,
      maxSupportedTransactionVersion: 0,
    });
    if (tx) return tx;
    if (attempt < maxAttempts - 1) {
      // Capped back-off: 2s, 4s, 6s, 8s, 10s, 10s, 10s… (max total ≈ ~100s)
      await new Promise(r => setTimeout(r, Math.min(baseDelayMs * (attempt + 1), 10_000)));
    }
  }
  return null;
}

/**
 * Verify a burn transaction on-chain and record it in the database.
 * This is the core burn verification engine.
 */
export async function verifyAndRecordBurn(
  walletAddress: string,
  signature: string,
  claimedBurnAmount: string,
  claimedFeeAmount: string,
  deviceFingerprint: string | undefined,
  clientIp: string | undefined,
): Promise<BurnResult> {
  // 1. Fetch transaction from RPC — retries internally so we never fail a
  //    legitimately submitted tx just because finalization hasn't happened yet.
  const tx = await fetchTransactionWithRetry(signature);

  if (!tx) throw new Error('TRANSACTION_NOT_FOUND');
  if (tx.meta?.err) throw new Error('TRANSACTION_FAILED_ON_CHAIN');

  // 2. Quick check for replay (fast path — avoids expensive parsing for obvious dupes).
  //    The authoritative duplicate check runs inside the transaction below under an
  //    advisory lock on the signature hash to eliminate the TOCTOU race window.
  const [earlyDupe] = await db
    .select({ id: burns.id })
    .from(burns)
    .where(eq(burns.txSignature, signature))
    .limit(1);
  if (earlyDupe) {
    securityLog({ eventType: 'BURN_DUPLICATE_SIGNATURE', walletAddress, severity: 'WARN', details: { signature } });
    throw new Error('DUPLICATE_SIGNATURE');
  }

  // 3. Parse instructions and verify burn + fee
  // Resolve all account keys including v0 address lookup tables
  const messageAccountKeys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
  });
  const accountKeys = messageAccountKeys.staticAccountKeys;
  // For v0 txs, keyFromIndex provides lookup-table accounts beyond static keys
  const resolveKey = (index: number) => messageAccountKeys.get(index) ?? accountKeys[index];

  let burnVerified = false;
  let feeVerified = false;
  let actualBurnAmount = BigInt(0);
  let actualFeeAmount = BigInt(0);

  const instructions = tx.transaction.message.compiledInstructions
    ?? (tx.transaction.message as unknown as { instructions: typeof tx.transaction.message.compiledInstructions }).instructions;

  if (!instructions) throw new Error('CANNOT_PARSE_INSTRUCTIONS');

  for (const ix of instructions) {
    const programIdIndex = ix.programIdIndex;
    const programId = resolveKey(programIdIndex);

    if (programId?.equals(TOKEN_PROGRAM_ID)) {
      // Decode SPL Token instruction type from first byte
      const data = Buffer.from(ix.data);
      const instructionType = data[0];

      if (instructionType === 8 || instructionType === 15) {
        // Burn (8) or BurnChecked (15): data[1..8] = amount (LE u64)
        const accountIndices = ix.accountKeyIndexes;
        const account = resolveKey(accountIndices[0]!);
        const mint = resolveKey(accountIndices[1]!);
        const authority = resolveKey(accountIndices[2]!);

        if (!mint?.equals(SKR_MINT)) {
          securityLog({ eventType: 'BURN_WRONG_MINT', walletAddress, severity: 'WARN', details: { signature, mint: mint?.toBase58() } });
          throw new Error('WRONG_MINT');
        }
        if (!authority?.equals(new PublicKey(walletAddress))) {
          securityLog({ eventType: 'BURN_WRONG_AUTHORITY', walletAddress, severity: 'WARN', details: { signature, authority: authority?.toBase58() } });
          throw new Error('WRONG_AUTHORITY');
        }

        const expectedAta = getUserSkrAta(walletAddress);
        if (!account?.equals(expectedAta)) throw new Error('WRONG_SOURCE_ACCOUNT');

        if (data.length < 9) throw new Error('MALFORMED_BURN_INSTRUCTION');
        actualBurnAmount = data.readBigUInt64LE(1);
        burnVerified = true;
      }

      if (instructionType === 3 || instructionType === 12) {
        // Transfer (3): [source, destination, authority]
        // TransferChecked (12): [source, mint, destination, authority]
        const accountIndices = ix.accountKeyIndexes;
        const destination = instructionType === 12
          ? resolveKey(accountIndices[2]!)
          : resolveKey(accountIndices[1]!);
        const authority = instructionType === 12
          ? resolveKey(accountIndices[3]!)
          : resolveKey(accountIndices[2]!);

        if (destination?.equals(TREASURY_SKR_ATA) && authority?.equals(new PublicKey(walletAddress))) {
          if (data.length < 9) throw new Error('MALFORMED_FEE_INSTRUCTION');
          actualFeeAmount = data.readBigUInt64LE(1);
          feeVerified = true;
        }
      }
    }
  }

  if (!burnVerified) throw new Error('NO_BURN_INSTRUCTION');

  // 4. Verify amounts
  const decimals = await getMintDecimals();
  const minBurnBase = parseUnits(env.MIN_BURN_SKR.toString(), decimals);
  if (actualBurnAmount < minBurnBase) {
    securityLog({ eventType: 'BURN_AMOUNT_TOO_LOW', walletAddress, severity: 'WARN', details: { signature, actual: actualBurnAmount.toString(), min: minBurnBase.toString() } });
    throw new Error('BURN_AMOUNT_TOO_LOW');
  }

  const claimedBurnBase = parseUnits(claimedBurnAmount, decimals);
  if (actualBurnAmount !== claimedBurnBase) throw new Error('BURN_AMOUNT_MISMATCH');

  // Enforce minimum platform fee unconditionally — prevents bypass via feeAmount:"0"
  const minFeeBase = parseUnits(env.PLATFORM_FEE_SKR.toString(), decimals);
  if (minFeeBase > BigInt(0)) {
    if (!feeVerified) throw new Error('FEE_NOT_FOUND');
    if (actualFeeAmount < minFeeBase) {
      securityLog({ eventType: 'BURN_FEE_TOO_LOW', walletAddress, severity: 'WARN', details: { signature, actual: actualFeeAmount.toString(), min: minFeeBase.toString() } });
      throw new Error('FEE_TOO_LOW');
    }
  }

  // Also verify claimed fee matches on-chain if provided
  if (claimedFeeAmount && claimedFeeAmount !== '0') {
    const claimedFeeBase = parseUnits(claimedFeeAmount, decimals);
    if (actualFeeAmount !== claimedFeeBase) throw new Error('FEE_AMOUNT_MISMATCH');
  }

  // 5. Capture UTC burn day
  if (!tx.blockTime) throw new Error('MISSING_BLOCK_TIME');
  const blockTime = tx.blockTime; // capture after null check for TypeScript
  const burnDate = getUTCDateString(blockTime);

  // 6. Block time freshness (configurable window, one-directional)
  const now = Math.floor(Date.now() / 1000);
  if (now - blockTime > env.TX_FRESHNESS_WINDOW) {
    securityLog({ eventType: 'BURN_TX_TOO_OLD', walletAddress, severity: 'WARN', details: { signature, blockTime, serverTime: now, window: env.TX_FRESHNESS_WINDOW } });
    throw new Error('TRANSACTION_TOO_OLD');
  }
  if (blockTime - now > 60) {
    securityLog({ eventType: 'BURN_TX_FUTURE', walletAddress, severity: 'WARN', details: { signature, blockTime, serverTime: now } });
    throw new Error('TRANSACTION_FROM_FUTURE');
  }

  // 7. Get or create user (race-safe upsert)
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);

  if (!user) {
    const [newUser] = await db
      .insert(users)
      .values({ walletAddress, deviceFingerprint })
      .onConflictDoUpdate({
        target: users.walletAddress,
        set: { updatedAt: new Date() },
      })
      .returning();
    user = newUser!;
  }

  // Convert actual amounts to UI units for storage using string math (no float precision loss)
  const burnAmountStr = formatUnits(actualBurnAmount, decimals);
  const feeAmountStr = formatUnits(actualFeeAmount, decimals);

  let newStreak = 0;
  let longestStreak = 0;
  let newLifetimeBurnedStr = '0';
  let newBadges: BadgeDefinition[] = [];

  // 8–12. Atomic insert burn + update user + insert badges
  const burnRecord = await db.transaction(async (dbTx) => {
    // Acquire advisory locks: one on the signature to prevent duplicate-insert races
    // (TOCTOU between the early check above and the INSERT below), and one on the
    // wallet to serialise streak/milestone calculations.
    await dbTx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${signature}))`);
    await dbTx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${walletAddress}))`);

    // Authoritative duplicate check under the signature lock
    const [dupCheck] = await dbTx
      .select({ id: burns.id })
      .from(burns)
      .where(eq(burns.txSignature, signature))
      .limit(1);
    if (dupCheck) {
      throw new Error('DUPLICATE_SIGNATURE');
    }

    // Reload user under the lock so streak/milestone calculations are race-safe.
    const [lockedUser] = await dbTx
      .select()
      .from(users)
      .where(eq(users.walletAddress, walletAddress))
      .limit(1);
    if (!lockedUser) throw new Error('USER_NOT_FOUND');

    // Recompute streak using locked state.
    const yesterday = yesterdayUTC(burnDate);

    // Shield gap coverage: if user missed days but has shields, consume them
    let shieldsConsumedInBurn = 0;
    if (
      lockedUser.currentStreak > 0 &&
      lockedUser.streakShields > 0 &&
      lockedUser.lastBurnDate &&
      lockedUser.lastBurnDate !== yesterday &&
      lockedUser.lastBurnDate !== burnDate
    ) {
      const lastDate = new Date(lockedUser.lastBurnDate + 'T00:00:00Z');
      const yestDate = new Date(yesterday + 'T00:00:00Z');
      const gapDays = Math.round((yestDate.getTime() - lastDate.getTime()) / 86_400_000);
      if (gapDays > 0 && gapDays <= lockedUser.streakShields) {
        shieldsConsumedInBurn = gapDays;
      }
    }

    if (lockedUser.lastBurnDate === yesterday || shieldsConsumedInBurn > 0) {
      newStreak = lockedUser.currentStreak + 1;
    } else if (lockedUser.lastBurnDate === burnDate) {
      newStreak = lockedUser.currentStreak;
    } else {
      newStreak = 1;
    }
    longestStreak = Math.max(newStreak, lockedUser.longestStreak);

    // Use actual decimals (not hardcoded 6) so precision matches the mint.
    newLifetimeBurnedStr = addDecimalStrings(lockedUser.lifetimeBurned ?? '0', burnAmountStr, decimals);
    const newLifetimeBurnedNum = parseFloat(newLifetimeBurnedStr);

    // Daily volume (today's total including this burn).
    const [dailyRow] = await dbTx
      .select({
        total: sql<string>`COALESCE(SUM(burn_amount::numeric), 0)`,
        cnt: sql<number>`COUNT(*)::int`,
      })
      .from(burns)
      .where(and(eq(burns.userId, lockedUser.id), eq(burns.burnDate, burnDate), eq(burns.status, 'VERIFIED')));
    const dailyVolume = parseFloat(dailyRow?.total ?? '0') + parseFloat(burnAmountStr);
    const dailyBurnCount = (dailyRow?.cnt ?? 0) + 1;

    // Total verified burn count (including this one which hasn't been inserted yet).
    const [countRow] = await dbTx
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(burns)
      .where(and(eq(burns.userId, lockedUser.id), eq(burns.status, 'VERIFIED')));
    const totalBurnCount = (countRow?.cnt ?? 0) + 1;

    // Perfect months — count months where every day has at least one burn.
    // Use UTC month boundary and only completed months.
    const [perfectRow] = await dbTx.execute(sql`
      WITH monthly AS (
        SELECT DATE_TRUNC('month', burn_date::date) AS m,
               COUNT(DISTINCT burn_date) AS burn_days,
               EXTRACT(DAY FROM (DATE_TRUNC('month', burn_date::date) + INTERVAL '1 month - 1 day'))::int AS days_in_month
        FROM burns
        WHERE user_id = ${lockedUser.id} AND status = 'VERIFIED'
          AND DATE_TRUNC('month', burn_date::date) < DATE_TRUNC('month', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
        GROUP BY DATE_TRUNC('month', burn_date::date)
      )
      SELECT COUNT(*)::int AS cnt FROM monthly WHERE burn_days = days_in_month
    `);
    const perfectMonths = (perfectRow as { cnt: number })?.cnt ?? 0;

    // Check milestones under lock to avoid duplicate-grant races.
    const earnedBadges = await dbTx
      .select({ badgeId: badges.badgeId })
      .from(badges)
      .where(eq(badges.userId, lockedUser.id));
    const earnedIds = new Set(earnedBadges.map(b => b.badgeId));
    newBadges = checkMilestones(newStreak, newLifetimeBurnedNum, earnedIds, dailyVolume, totalBurnCount, perfectMonths);

    const [record] = await dbTx
      .insert(burns)
      .values({
        userId: lockedUser.id,
        walletAddress,
        txSignature: signature,
        burnAmount: burnAmountStr,
        feeAmount: feeAmountStr,
        burnDate,
        streakDay: newStreak,
        slot: tx.slot ?? 0,
        blockTime: new Date(blockTime * 1000),
        status: 'VERIFIED',
        badgeEarnedId: newBadges[0]?.id ?? null,
        deviceFingerprint,
        clientIp,
        verifiedAt: new Date(),
      })
      .returning();

    let insertedBadgeCount = 0;
    for (const badge of newBadges) {
      const inserted = await dbTx.insert(badges).values({
        userId: lockedUser.id,
        walletAddress,
        badgeId: badge.id,
        badgeType: badge.type,
        requirementValue: badge.threshold,
        nftMintStatus: 'PENDING_CLAIM',
      }).onConflictDoNothing({ target: [badges.userId, badges.badgeId] }).returning({ id: badges.id });
      insertedBadgeCount += inserted.length;
    }

    // ── Consume active buffs before XP grant ──
    const xpMultiplier = await consumeXpBoost(lockedUser.id, dbTx);
    const challengeMultiplier = await consumeGoldenBurn(lockedUser.id, dbTx);

    // ── XP: burn XP + badge XP (with buff multiplier) ──
    const burnXpResult = await grantBurnXp(lockedUser.id, newStreak, record!.id, dbTx, xpMultiplier);
    let totalXpThisBurn = burnXpResult.xpEarned;

    for (const badge of newBadges) {
      const badgeXpResult = await grantBadgeXp(lockedUser.id, badge.id, dbTx);
      totalXpThisBurn += badgeXpResult.xpEarned;
    }

    // ── Challenges: evaluate after burn ──
    const burnHourUTC = new Date(blockTime * 1000).getUTCHours();
    const thisBurnAmount = parseFloat(burnAmountStr);
    const burnCtx: BurnContext = {
      userId: lockedUser.id,
      walletAddress,
      burnAmount: thisBurnAmount * challengeMultiplier,
      dailyBurnCount,
      dailyVolume: dailyVolume + thisBurnAmount * (challengeMultiplier - 1),
      burnHourUTC,
      currentStreak: newStreak,
      weeklyBurnDays: 0, // will be computed inside evaluateChallenges
      weeklyVolume: 0,
      lifetimeBurned: newLifetimeBurnedNum,
      goldenBurnVolumeDelta: thisBurnAmount * (challengeMultiplier - 1),
      goldenBurnCountDelta: 0,
    };
    const challengeResults = await evaluateChallenges(burnCtx, burnDate, dbTx);
    totalXpThisBurn += challengeResults.totalChallengeXp;

    // ── Lucky Burns: roll for a drop (requires minimum burn) ──
    const luckyDrop = await rollLuckyDrop(lockedUser.id, record!.id, newStreak, thisBurnAmount, walletAddress, burnDate, dbTx);
    if (luckyDrop.xpAwarded) totalXpThisBurn += luckyDrop.xpAwarded;

    // If lucky drop included a CHALLENGE_SKIP and sweep wasn't already awarded,
    // re-check whether all 3 dailies are now complete for the sweep bonus.
    if (luckyDrop.dropped && !challengeResults.dailySweep) {
      const sweepRecheck = await recheckDailySweep(lockedUser.id, burnDate, dbTx);
      if (sweepRecheck.dailySweepXp > 0) {
        totalXpThisBurn += sweepRecheck.dailySweepXp;
        challengeResults.dailySweep = true;
        challengeResults.dailySweepXp = sweepRecheck.dailySweepXp;
        challengeResults.totalChallengeXp += sweepRecheck.dailySweepXp;
      }
    }

    await dbTx
      .update(users)
      .set({
        currentStreak: newStreak,
        longestStreak,
        lifetimeBurned: newLifetimeBurnedStr,
        lastBurnDate: burnDate,
        lastBurnAt: new Date(),
        badgeCount: lockedUser.badgeCount + insertedBadgeCount,
        ...(shieldsConsumedInBurn > 0 ? {
          streakShields: sql`GREATEST(${users.streakShields} - ${shieldsConsumedInBurn}, 0)`,
          streakShieldActive: sql`CASE WHEN ${users.streakShields} > ${shieldsConsumedInBurn} THEN true ELSE false END`,
        } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, lockedUser.id));

    // Re-read user's authoritative XP/level after ALL grants (burn + badge + challenge + lucky)
    const [finalUser] = await dbTx
      .select({ xp: users.xp, level: users.level, streakShields: users.streakShields })
      .from(users)
      .where(eq(users.id, lockedUser.id))
      .limit(1);

    if (!finalUser) throw new Error('USER_NOT_FOUND_AFTER_BURN');

    return {
      record: record!,
      totalXpThisBurn,
      finalXp: Number(finalUser.xp),
      finalLevel: finalUser.level,
      leveledUp: finalUser.level > lockedUser.level,
      shieldsAwarded: finalUser.streakShields - lockedUser.streakShields + shieldsConsumedInBurn,
      challengeResults,
      luckyDrop,
    };
  });

  securityLog({ eventType: 'BURN_VERIFIED', walletAddress, severity: 'INFO', details: { signature, burnAmount: burnAmountStr, feeAmount: feeAmountStr, streak: newStreak, badges: newBadges.length, xp: burnRecord.totalXpThisBurn } });

  // Invalidate community stats caches so totals reflect this burn immediately
  await Promise.allSettled([
    redis.del('treasury:stats'),
    redis.del('global:stats'),
  ]);

  // Best-effort referral qualification check (does not block burn success).
  evaluateReferralQualification(burnRecord.record.userId).catch((err) => {
    console.error('[referral] qualification check failed:', err?.message ?? err);
  });

  return {
    burnId: burnRecord.record.id,
    status: 'VERIFIED',
    newStreak,
    longestStreak,
    lifetimeBurned: newLifetimeBurnedStr,
    badgesEarned: newBadges.map(b => ({ id: b.id, name: b.name })),
    xpEarned: burnRecord.totalXpThisBurn,
    totalXp: burnRecord.finalXp,
    level: burnRecord.finalLevel,
    levelTitle: getLevelTitle(burnRecord.finalLevel),
    leveledUp: burnRecord.leveledUp,
    shieldsAwarded: burnRecord.shieldsAwarded,
    challengeResults: burnRecord.challengeResults,
    luckyDrop: burnRecord.luckyDrop.dropped ? burnRecord.luckyDrop : undefined,
    luckyDropsToday: burnRecord.luckyDrop.luckyDropsToday,
    maxDailyLuckyDrops: burnRecord.luckyDrop.maxDailyLuckyDrops,
  };
}
