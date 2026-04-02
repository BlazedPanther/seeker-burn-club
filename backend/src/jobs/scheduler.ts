import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { securityLogs } from '../db/schema.js';
import { todayUTC, yesterdayUTC } from '../lib/solana.js';
import { securityLog } from '../lib/security.js';
import { checkDeterministicMintExists } from '../lib/nft.js';
import type { FastifyBaseLogger } from 'fastify';

let log: FastifyBaseLogger | Console = console;
const intervalIds: NodeJS.Timeout[] = [];

/**
 * Background job: Reset broken streaks.
 * Uses pg_advisory_lock to prevent concurrent execution across multiple instances.
 */
export async function resetBrokenStreaks(): Promise<number> {
  const today = todayUTC();
  const yesterday = yesterdayUTC(today);
  // Grace period: only reset streaks if last burn was strictly before yesterday.
  // This prevents resetting a streak at 00:05 UTC for a user who burned yesterday
  // but hasn't burned yet today — they still have until 23:59 UTC to continue.

  // Use a TRANSACTION-level advisory lock (pg_try_advisory_xact_lock) inside a
  // db.transaction() so the lock is automatically released when the transaction
  // commits or rolls back — regardless of which pool connection is used.
  //
  // Session-level locks (pg_try_advisory_lock) must NOT be used here because:
  //   1. db.execute() borrows a connection, runs the query, and returns it to the pool.
  //   2. The lock is acquired on connection A but subsequent db.execute() calls can
  //      run on connections B, C, D …
  //   3. pg_advisory_unlock on a different connection is a silent no-op — the lock
  //      stays on connection A until its session ends (pool shutdown / process restart).
  //   4. All future scheduler runs see the lock as held and skip forever.
  return db.transaction(async (tx) => {
    // pg_try_advisory_xact_lock: non-blocking, returns immediately if lock is unavailable.
    // Automatically released when the transaction ends.
    const lockResult = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(1001) AS acquired`);
    const lockRow = lockResult[0] as unknown as Record<string, unknown> | undefined;
    const acquired = lockRow?.acquired;
    if (!acquired) {
      log.info('[Job] Streak reset skipped — another instance holds the lock');
      return 0;
    }

    // First: for users with shields who missed a day, set a 24h recovery window
    // instead of auto-consuming shields. Users decide whether to use a shield.
    const recoveryResult = await tx.execute(sql`
      UPDATE users
      SET streak_recovery_deadline = NOW() + INTERVAL '24 hours',
          streak_recovery_gap_days = GREATEST(
            (DATE(${today} || 'T00:00:00Z') - DATE(last_burn_date || 'T00:00:00Z'))::int - 1,
            1
          ),
          updated_at = NOW()
      WHERE current_streak > 0
        AND streak_shields > 0
        AND streak_recovery_deadline IS NULL
        AND last_burn_date < ${yesterday}
      RETURNING wallet_address, current_streak
    `);
    const recoveryRows = Array.isArray(recoveryResult) ? recoveryResult : [];
    if (recoveryRows.length > 0) {
      securityLog({ eventType: 'STREAK_RECOVERY_WINDOW_OPENED', severity: 'INFO', details: { count: recoveryRows.length, date: today } });
      log.info(`[Job] Opened recovery window for ${recoveryRows.length} users with shields`);
    }

    // Expire recovery windows that have passed: reset streak permanently
    const expiredRecovery = await tx.execute(sql`
      UPDATE users
      SET current_streak = 0,
          streak_broken_at = NOW(),
          streak_recovery_deadline = NULL,
          streak_recovery_gap_days = 0,
          updated_at = NOW()
      WHERE streak_recovery_deadline IS NOT NULL
        AND streak_recovery_deadline < NOW()
        AND current_streak > 0
      RETURNING wallet_address, current_streak AS old_streak
    `);
    const expiredRows = Array.isArray(expiredRecovery) ? expiredRecovery : [];
    if (expiredRows.length > 0) {
      securityLog({ eventType: 'STREAK_RECOVERY_EXPIRED', severity: 'INFO', details: { count: expiredRows.length, date: today } });
      log.info(`[Job] Expired recovery for ${expiredRows.length} users — streaks reset`);
    }

    // Then: reset streaks for unshielded users who missed burns (no recovery possible)
    const result = await tx.execute(sql`
      UPDATE users
      SET current_streak = 0,
          streak_broken_at = NOW(),
          updated_at = NOW()
      WHERE current_streak > 0
        AND streak_shields = 0
        AND streak_recovery_deadline IS NULL
        AND last_burn_date < ${yesterday}
      RETURNING wallet_address, current_streak AS old_streak
    `);

    const rows = Array.isArray(result) ? result : [];
    const count = rows.length + expiredRows.length;

    if (count > 0) {
      await tx.insert(securityLogs).values({
        eventType: 'STREAK_RESET_JOB',
        details: { count, date: today },
        severity: 'INFO',
      });
    }

    log.info(`[Job] Reset ${count} broken streaks`);
    return count;
  });
}

/**
 * Background job: Cleanup expired auth challenges and old sessions.
 * Should run daily.
 */
export async function cleanupExpired(): Promise<void> {
  await db.transaction(async (tx) => {
    const lockResult = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(1002) AS acquired`);
    const acquired = (lockResult[0] as unknown as Record<string, unknown>)?.acquired;
    if (!acquired) {
      log.info('[Job] Cleanup skipped — another instance holds the lock');
      return;
    }

    // Delete expired challenges (older than 1 day)
    await tx.execute(sql`
      DELETE FROM auth_challenges
      WHERE expires_at < NOW() - INTERVAL '1 day'
    `);

    // Delete expired sessions (older than 90 days)
    await tx.execute(sql`
      DELETE FROM auth_sessions
      WHERE expires_at < NOW() - INTERVAL '90 days'
    `);

    // Delete old security logs (older than 1 year)
    await tx.execute(sql`
      DELETE FROM security_logs
      WHERE created_at < NOW() - INTERVAL '1 year'
    `);

    log.info('[Job] Cleaned up expired records');
  });
}

/**
 * Background job: Mark stale pending burns as FAILED.
 * Should run every 10 minutes.
 */
export async function markStaleBurns(): Promise<void> {
  await db.transaction(async (tx) => {
    const lockResult = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(1003) AS acquired`);
    const acquired = (lockResult[0] as unknown as Record<string, unknown>)?.acquired;
    if (!acquired) {
      log.info('[Job] Stale burns check skipped — another instance holds the lock');
      return;
    }

    await tx.execute(sql`
      UPDATE burns
      SET status = 'FAILED',
          verification_error = 'TIMEOUT_UNCONFIRMED'
      WHERE status = 'PENDING'
        AND submitted_at < NOW() - INTERVAL '10 minutes'
    `);

    log.info('[Job] Marked stale pending burns as FAILED');
  });
}

/**
 * Background job: Recover badges stuck in MINTING state.
 *
 * Causes: server restart during async mint, unhandled exception in fire-and-forget,
 * or confirmTransaction timeout where the tx actually landed.
 *
 * For each stale badge (MINTING for > 10 minutes):
 *   1. Check on-chain whether the deterministic mint account exists.
 *   2. If yes → mark COMPLETED (NFT minted, DB just didn't record it).
 *   3. If no  → mark MINT_FAILED with reason so user can retry.
 */
export async function recoverStaleMints(): Promise<void> {
  const staleRows = await db.execute(sql`
    SELECT id, wallet_address, badge_id, nft_seed_salt, nft_tx_signature
    FROM badges
    WHERE nft_mint_status = 'MINTING'
      AND nft_mint_started_at < NOW() - INTERVAL '10 minutes'
  `);

  const rows = Array.isArray(staleRows) ? staleRows as Record<string, unknown>[] : [];
  if (rows.length === 0) return;

  log.info(`[Job] Found ${rows.length} stale MINTING badge(s) — recovering`);

  for (const row of rows) {
    const id = row.id as string;
    const wallet = row.wallet_address as string;
    const badgeId = row.badge_id as string;
    const seedSalt = (row.nft_seed_salt as string) ?? undefined;

    try {
      const existingMint = await checkDeterministicMintExists(wallet, badgeId, seedSalt);

      if (existingMint) {
        // NFT exists on-chain — prior mint succeeded but DB wasn't updated
        await db.execute(sql`
          UPDATE badges
          SET nft_mint_status = 'COMPLETED',
              nft_mint_address = ${existingMint},
              nft_mint_failure_reason = NULL,
              pending_claim_mint = NULL,
              pending_claim_expires_at = NULL
          WHERE id = ${id} AND nft_mint_status = 'MINTING'
        `);
        log.info({ wallet, badgeId, mintAddress: existingMint }, '[Job] Recovered stale mint → COMPLETED');
      } else {
        // NFT not found on-chain — mint truly failed
        await db.execute(sql`
          UPDATE badges
          SET nft_mint_status = 'MINT_FAILED',
              nft_mint_failure_reason = 'STALE_MINTING_TIMEOUT'
          WHERE id = ${id} AND nft_mint_status = 'MINTING'
        `);
        log.info({ wallet, badgeId }, '[Job] Recovered stale mint → MINT_FAILED');
      }
    } catch (err) {
      log.error({ err, wallet, badgeId }, '[Job] Error recovering stale mint');
    }
  }
}

/**
 * Start all background jobs with setInterval.
 * In production, use a proper job scheduler (e.g., BullMQ, node-cron).
 */
export function startBackgroundJobs(logger?: FastifyBaseLogger): void {
  if (logger) log = logger;

  // Run streak reset immediately on startup to catch any missed window
  resetBrokenStreaks().catch((err) => log.error(err));

  // Reset streaks: check every 30 minutes
  intervalIds.push(setInterval(() => {
    resetBrokenStreaks().catch((err) => log.error(err));
  }, 30 * 60 * 1000));

  // Cleanup: every 12 hours
  intervalIds.push(setInterval(() => {
    cleanupExpired().catch((err) => log.error(err));
  }, 12 * 60 * 60 * 1000));

  // Stale burns: every 10 minutes
  intervalIds.push(setInterval(() => {
    markStaleBurns().catch((err) => log.error(err));
  }, 10 * 60 * 1000));

  // Recover stale MINTING badges: every 5 minutes
  intervalIds.push(setInterval(() => {
    recoverStaleMints().catch((err) => log.error(err));
  }, 5 * 60 * 1000));

  log.info('[Jobs] Background jobs started');
}

/**
 * Stop all background jobs (for graceful shutdown).
 */
export function stopBackgroundJobs(): void {
  for (const id of intervalIds) clearInterval(id);
  intervalIds.length = 0;
  log.info('[Jobs] Background jobs stopped');
}
