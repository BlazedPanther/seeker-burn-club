import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { securityLogs } from '../db/schema.js';
import { todayUTC, yesterdayUTC } from '../lib/solana.js';
import { securityLog } from '../lib/security.js';
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
  // Grace period: only reset streaks if last burn was before yesterday.
  // This prevents resetting a streak at 00:05 UTC for a user who just hasn't
  // burned yet today — they still have until 23:59 UTC to maintain their streak.
  const dayBeforeYesterday = yesterdayUTC(yesterday);

  // Advisory lock prevents concurrent execution across multiple server instances
  const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(1001) AS acquired`);
  const lockRow = lockResult[0] as unknown as Record<string, unknown> | undefined;
  const acquired = lockRow?.acquired;
  if (!acquired) {
    log.info('[Job] Streak reset skipped — another instance holds the lock');
    return 0;
  }

  try {
    // First: consume shields for users who would lose their streak but have a shield active
    const shieldResult = await db.execute(sql`
      UPDATE users
      SET streak_shield_active = false,
          updated_at = NOW()
      WHERE current_streak > 0
        AND streak_shield_active = true
        AND last_burn_date < ${dayBeforeYesterday}
      RETURNING wallet_address, current_streak
    `);
    const shieldRows = Array.isArray(shieldResult) ? shieldResult : [];
    if (shieldRows.length > 0) {
      securityLog({ eventType: 'STREAK_SHIELD_CONSUMED_JOB', severity: 'INFO', details: { count: shieldRows.length, date: today } });
      log.info(`[Job] Consumed streak shields for ${shieldRows.length} users`);
    }

    // Then: reset streaks for unshielded users who missed burns
    const result = await db.execute(sql`
      UPDATE users
      SET current_streak = 0,
          streak_broken_at = NOW(),
          updated_at = NOW()
      WHERE current_streak > 0
        AND streak_shield_active = false
        AND last_burn_date < ${dayBeforeYesterday}
      RETURNING wallet_address, current_streak AS old_streak
    `);

    // db.execute returns rows array
    const rows = Array.isArray(result) ? result : [];
    const count = rows.length;

    if (count > 0) {
      await db.insert(securityLogs).values({
        eventType: 'STREAK_RESET_JOB',
        details: { count, date: today },
        severity: 'INFO',
      });
    }

    log.info(`[Job] Reset ${count} broken streaks`);
    return count;
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(1001)`);
  }
}

/**
 * Background job: Cleanup expired auth challenges and old sessions.
 * Should run daily.
 */
export async function cleanupExpired(): Promise<void> {
  // Delete expired challenges (older than 1 day)
  await db.execute(sql`
    DELETE FROM auth_challenges
    WHERE expires_at < NOW() - INTERVAL '1 day'
  `);

  // Delete expired sessions (older than 90 days)
  await db.execute(sql`
    DELETE FROM auth_sessions
    WHERE expires_at < NOW() - INTERVAL '90 days'
  `);

  // Delete old security logs (older than 1 year)
  await db.execute(sql`
    DELETE FROM security_logs
    WHERE created_at < NOW() - INTERVAL '1 year'
  `);

  log.info('[Job] Cleaned up expired records');
}

/**
 * Background job: Mark stale pending burns as FAILED.
 * Should run every 10 minutes.
 */
export async function markStaleBurns(): Promise<void> {
  await db.execute(sql`
    UPDATE burns
    SET status = 'FAILED',
        verification_error = 'TIMEOUT_UNCONFIRMED'
    WHERE status = 'PENDING'
      AND submitted_at < NOW() - INTERVAL '10 minutes'
  `);

  log.info('[Job] Marked stale pending burns as FAILED');
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
