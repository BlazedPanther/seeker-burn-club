/**
 * Daily & Weekly Challenge engine.
 *
 * Daily challenges: 3 per day, rotating deterministically per wallet + UTC day.
 * Weekly challenges: 2 per week, rotating per wallet + ISO week.
 *
 * Challenges are evaluated server-side after each burn.
 * Progress is stored in daily_challenge_progress / weekly_challenge_progress.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import {
  users, burns,
  dailyChallengeProgress, weeklyChallengeProgress, xpLedger,
} from '../db/schema.js';
import { grantXp, DAILY_SWEEP_BONUS_XP } from './xp.service.js';
import { MAX_SHIELDS } from './shop.service.js';

// ── Daily Challenge Definitions ──────────────────────────────

export interface ChallengeDefinition {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  shieldReward?: number;
  /** Evaluate the challenge given the burn context. Returns progress value (>= target = completed). */
  evaluate: (ctx: BurnContext) => { progress: number; target: number };
}

export interface BurnContext {
  userId: string;
  walletAddress: string;
  burnAmount: number;       // SKR this burn (UI units)
  dailyBurnCount: number;   // total burns today including this one
  dailyVolume: number;      // total SKR today including this burn
  burnHourUTC: number;      // 0-23
  currentStreak: number;
  weeklyBurnDays: number;
  weeklyVolume: number;
  lifetimeBurned: number;
  goldenBurnVolumeDelta: number; // extra volume from golden burn multiplier
  goldenBurnCountDelta: number;  // extra count from golden burn multiplier
}

const DAILY_TEMPLATES: ChallengeDefinition[] = [
  {
    id: 'ignite',
    title: 'IGNITE',
    description: 'Execute any burn today',
    xpReward: 100,
    evaluate: (ctx) => ({ progress: ctx.dailyBurnCount >= 1 ? 1 : 0, target: 1 }),
  },
  {
    id: 'double_burn',
    title: 'DOUBLE BURN',
    description: 'Complete 2 separate burns today',
    xpReward: 200,
    evaluate: (ctx) => ({ progress: ctx.dailyBurnCount, target: 2 }),
  },
  {
    id: 'flame_thrower',
    title: 'FLAME THROWER',
    description: 'Burn at least 50 SKR today',
    xpReward: 250,
    evaluate: (ctx) => ({ progress: ctx.dailyVolume, target: 50 }),
  },
  {
    id: 'streak_guardian',
    title: 'STREAK GUARDIAN',
    description: 'Keep your streak alive',
    xpReward: 100,
    evaluate: (ctx) => ({ progress: ctx.dailyBurnCount >= 1 ? 1 : 0, target: 1 }),
  },
  {
    id: 'early_bird',
    title: 'EARLY BIRD',
    description: 'Burn before 06:00 UTC',
    xpReward: 150,
    evaluate: (ctx) => ({ progress: ctx.burnHourUTC < 6 && ctx.dailyBurnCount >= 1 ? 1 : 0, target: 1 }),
  },
  {
    id: 'night_owl',
    title: 'NIGHT OWL',
    description: 'Burn after 22:00 UTC',
    xpReward: 150,
    evaluate: (ctx) => ({ progress: ctx.burnHourUTC >= 22 && ctx.dailyBurnCount >= 1 ? 1 : 0, target: 1 }),
  },
  {
    id: 'hot_coal',
    title: 'HOT COAL',
    description: 'Burn within 2 hours of UTC midnight',
    xpReward: 150,
    evaluate: (ctx) => ({ progress: (ctx.burnHourUTC < 2 || ctx.burnHourUTC >= 22) && ctx.dailyBurnCount >= 1 ? 1 : 0, target: 1 }),
  },
  {
    id: 'big_spender',
    title: 'BIG SPENDER',
    description: 'Burn at least 100 SKR today',
    xpReward: 300,
    evaluate: (ctx) => ({ progress: ctx.dailyVolume, target: 100 }),
  },
];

const WEEKLY_TEMPLATES: ChallengeDefinition[] = [
  {
    id: 'weekly_inferno',
    title: '7-DAY INFERNO',
    description: 'Burn every day this week',
    xpReward: 1000,
    shieldReward: 1,
    evaluate: (ctx) => ({ progress: ctx.weeklyBurnDays, target: 7 }),
  },
  {
    id: 'volume_king',
    title: 'VOLUME KING',
    description: 'Burn 200+ SKR this week',
    xpReward: 1500,
    evaluate: (ctx) => ({ progress: ctx.weeklyVolume, target: 200 }),
  },
  {
    id: 'grind_lord',
    title: 'GRIND LORD',
    description: 'Complete 20+ burns this week',
    xpReward: 1500,
    evaluate: () => ({ progress: 0, target: 20 }), // evaluated via weekly aggregate, see evaluateChallenges
  },
  {
    id: 'consistency',
    title: 'THE DISCIPLINE',
    description: 'Burn on at least 5 days this week',
    xpReward: 800,
    evaluate: (ctx) => ({ progress: ctx.weeklyBurnDays, target: 5 }),
  },
  {
    id: 'heatwave',
    title: 'HEATWAVE',
    description: 'Burn 500+ SKR this week',
    xpReward: 2000,
    shieldReward: 1,
    evaluate: (ctx) => ({ progress: ctx.weeklyVolume, target: 500 }),
  },
];

// ── Deterministic rotation ───────────────────────────────────

function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Pick 3 daily challenges for a wallet on a given UTC date. IGNITE is always first. */
export function getDailyChallengesForDate(walletAddress: string, dateStr: string): ChallengeDefinition[] {
  const seed = simpleHash(walletAddress + dateStr);
  const pool = DAILY_TEMPLATES.filter(c => c.id !== 'ignite');
  const ignite = DAILY_TEMPLATES.find(c => c.id === 'ignite')!;

  const a = pool[seed % pool.length]!;
  let bIdx = ((seed >>> 8) + 1) % pool.length;
  if (pool[bIdx]!.id === a.id) bIdx = (bIdx + 1) % pool.length;
  const b = pool[bIdx]!;

  return [ignite, a, b];
}

/** Pick 2 weekly challenges for a wallet on a given ISO week. */
export function getWeeklyChallengesForWeek(walletAddress: string, weekStartStr: string): ChallengeDefinition[] {
  const seed = simpleHash(walletAddress + weekStartStr);
  const a = WEEKLY_TEMPLATES[seed % WEEKLY_TEMPLATES.length]!;
  let bIdx = ((seed >>> 8) + 1) % WEEKLY_TEMPLATES.length;
  if (WEEKLY_TEMPLATES[bIdx]!.id === a.id) bIdx = (bIdx + 1) % WEEKLY_TEMPLATES.length;
  return [a, WEEKLY_TEMPLATES[bIdx]!];
}

/** Get the Monday of the ISO week containing a UTC date string 'YYYY-MM-DD'. */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

// ── Challenge evaluation after burn ──────────────────────────

export interface ChallengeResult {
  dailyChallenges: Array<{
    id: string;
    title: string;
    progress: number;
    target: number;
    completed: boolean;
    justCompleted: boolean;
    xpAwarded: number;
  }>;
  weeklyChallenges: Array<{
    id: string;
    title: string;
    progress: number;
    target: number;
    completed: boolean;
    justCompleted: boolean;
    xpAwarded: number;
    shieldAwarded: number;
  }>;
  dailySweep: boolean;
  dailySweepXp: number;
  totalChallengeXp: number;
  totalShieldsAwarded: number;
}

/**
 * Evaluate all challenges for a user after a burn.
 * Called inside the burn transaction for atomicity.
 */
export async function evaluateChallenges(
  ctx: BurnContext,
  burnDate: string,
  txn: DB,
): Promise<ChallengeResult> {
  const weekStart = getWeekStart(burnDate);
  const dailyDefs = getDailyChallengesForDate(ctx.walletAddress, burnDate);
  const weeklyDefs = getWeeklyChallengesForWeek(ctx.walletAddress, weekStart);

  let totalChallengeXp = 0;
  let totalShieldsAwarded = 0;

  // ── Daily challenges ──

  const dailyResults = [];
  for (const def of dailyDefs) {
    const { progress, target } = def.evaluate(ctx);
    const completed = progress >= target;

    // Upsert progress
    const [existing] = await txn
      .select({ id: dailyChallengeProgress.id, completed: dailyChallengeProgress.completed, xpAwarded: dailyChallengeProgress.xpAwarded })
      .from(dailyChallengeProgress)
      .where(and(
        eq(dailyChallengeProgress.userId, ctx.userId),
        eq(dailyChallengeProgress.challengeDate, burnDate),
        eq(dailyChallengeProgress.challengeId, def.id),
      ))
      .limit(1);

    const alreadyCompleted = existing?.completed ?? false;
    const justCompleted = completed && !alreadyCompleted;
    let xpAwarded = existing?.xpAwarded ?? 0;

    if (existing) {
      await txn
        .update(dailyChallengeProgress)
        .set({
          progressValue: progress.toString(),
          completed,
          completedAt: justCompleted ? new Date() : undefined,
          xpAwarded: justCompleted ? def.xpReward : xpAwarded,
        })
        .where(eq(dailyChallengeProgress.id, existing.id));
    } else {
      await txn.insert(dailyChallengeProgress).values({
        userId: ctx.userId,
        challengeDate: burnDate,
        challengeId: def.id,
        completed,
        progressValue: progress.toString(),
        xpAwarded: completed ? def.xpReward : 0,
        completedAt: completed ? new Date() : undefined,
      });
    }

    if (justCompleted) {
      xpAwarded = def.xpReward;
      await grantXp({ userId: ctx.userId, amount: def.xpReward, reason: 'DAILY_CHALLENGE', refId: def.id }, txn);
      totalChallengeXp += def.xpReward;
    }

    dailyResults.push({
      id: def.id,
      title: def.title,
      progress,
      target,
      completed,
      justCompleted,
      xpAwarded,
    });
  }

  // ── Daily sweep bonus ──

  const allDailiesCompleted = dailyResults.every(d => d.completed);
  let dailySweepXp = 0;
  const dailySweep = allDailiesCompleted;

  if (dailySweep) {
    // Check if sweep bonus was already awarded today
    const [sweepCheck] = await txn
      .select({ id: xpLedger.id })
      .from(xpLedger)
      .where(and(
        eq(xpLedger.userId, ctx.userId),
        eq(xpLedger.reason, 'DAILY_SWEEP'),
        sql`DATE(${xpLedger.createdAt} AT TIME ZONE 'UTC') = ${burnDate}`,
      ))
      .limit(1);

    if (!sweepCheck) {
      dailySweepXp = DAILY_SWEEP_BONUS_XP;
      await grantXp({ userId: ctx.userId, amount: DAILY_SWEEP_BONUS_XP, reason: 'DAILY_SWEEP', refId: burnDate }, txn);
      totalChallengeXp += DAILY_SWEEP_BONUS_XP;
    }
  }

  // ── Weekly challenges ──

  // Fetch weekly aggregates for proper evaluation
  const [weeklyAgg] = await txn.execute(sql`
    SELECT
      COUNT(DISTINCT burn_date)::int AS weekly_burn_days,
      COALESCE(SUM(burn_amount::numeric), 0)::float AS weekly_volume,
      COUNT(*)::int AS weekly_burn_count
    FROM burns
    WHERE user_id = ${ctx.userId}
      AND status = 'VERIFIED'
      AND burn_date >= ${weekStart}
  `);
  const wagg = weeklyAgg as { weekly_burn_days: number; weekly_volume: number; weekly_burn_count: number } | undefined;

  // Build a weekly-aware context including the current burn (not yet in DB).
  // ctx.dailyBurnCount === 1 means this is the first burn today → add today to days.
  // ctx.burnAmount already includes the golden burn multiplier (consistent with dailyVolume).
  const weeklyCtx: BurnContext = {
    ...ctx,
    weeklyBurnDays: (wagg?.weekly_burn_days ?? 0) + (ctx.dailyBurnCount === 1 ? 1 : 0),
    weeklyVolume: (wagg?.weekly_volume ?? 0) + ctx.burnAmount,
  };

  const weeklyResults = [];
  for (const def of weeklyDefs) {
    // For weekly challenges, re-evaluate with weekly aggregates
    let evalResult: { progress: number; target: number };
    if (def.id === 'grind_lord') {
      // +1 for the current burn (not yet inserted in DB)
      evalResult = { progress: (wagg?.weekly_burn_count ?? 0) + 1, target: 20 };
    } else {
      evalResult = def.evaluate(weeklyCtx);
    }
    const { progress, target } = evalResult;
    const completed = progress >= target;

    const [existing] = await txn
      .select({ id: weeklyChallengeProgress.id, completed: weeklyChallengeProgress.completed, xpAwarded: weeklyChallengeProgress.xpAwarded })
      .from(weeklyChallengeProgress)
      .where(and(
        eq(weeklyChallengeProgress.userId, ctx.userId),
        eq(weeklyChallengeProgress.weekStart, weekStart),
        eq(weeklyChallengeProgress.challengeId, def.id),
      ))
      .limit(1);

    const alreadyCompleted = existing?.completed ?? false;
    const justCompleted = completed && !alreadyCompleted;
    let xpAwarded = existing?.xpAwarded ?? 0;

    if (existing) {
      await txn
        .update(weeklyChallengeProgress)
        .set({
          progressValue: progress.toString(),
          completed,
          completedAt: justCompleted ? new Date() : undefined,
          xpAwarded: justCompleted ? def.xpReward : xpAwarded,
        })
        .where(eq(weeklyChallengeProgress.id, existing.id));
    } else {
      await txn.insert(weeklyChallengeProgress).values({
        userId: ctx.userId,
        weekStart,
        challengeId: def.id,
        completed,
        progressValue: progress.toString(),
        xpAwarded: completed ? def.xpReward : 0,
        completedAt: completed ? new Date() : undefined,
      });
    }

    if (justCompleted) {
      xpAwarded = def.xpReward;
      await grantXp({ userId: ctx.userId, amount: def.xpReward, reason: 'WEEKLY_CHALLENGE', refId: def.id }, txn);
      totalChallengeXp += def.xpReward;

      // Grant shield reward if applicable
      if (def.shieldReward && def.shieldReward > 0) {
        await txn
          .update(users)
          .set({
            streakShields: sql`LEAST(${users.streakShields} + ${def.shieldReward}, ${MAX_SHIELDS})`,
            streakShieldActive: true,
          })
          .where(eq(users.id, ctx.userId));
        totalShieldsAwarded += def.shieldReward;
      }
    }

    weeklyResults.push({
      id: def.id,
      title: def.title,
      progress,
      target,
      completed,
      justCompleted,
      xpAwarded,
      shieldAwarded: justCompleted && def.shieldReward ? def.shieldReward : 0,
    });
  }

  return {
    dailyChallenges: dailyResults,
    weeklyChallenges: weeklyResults,
    dailySweep,
    dailySweepXp,
    totalChallengeXp,
    totalShieldsAwarded,
  };
}

/**
 * Get current challenge state for a user (for the GET endpoint).
 */
export async function getChallengeState(
  userId: string,
  walletAddress: string,
  todayStr: string,
) {
  const weekStart = getWeekStart(todayStr);
  const dailyDefs = getDailyChallengesForDate(walletAddress, todayStr);
  const weeklyDefs = getWeeklyChallengesForWeek(walletAddress, weekStart);

  // Fetch stored progress
  const dailyProgress = await db
    .select()
    .from(dailyChallengeProgress)
    .where(and(
      eq(dailyChallengeProgress.userId, userId),
      eq(dailyChallengeProgress.challengeDate, todayStr),
    ));

  const weeklyProgress = await db
    .select()
    .from(weeklyChallengeProgress)
    .where(and(
      eq(weeklyChallengeProgress.userId, userId),
      eq(weeklyChallengeProgress.weekStart, weekStart),
    ));

  const daily = dailyDefs.map(def => {
    const p = dailyProgress.find(dp => dp.challengeId === def.id);
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      xpReward: def.xpReward,
      progress: parseFloat(p?.progressValue ?? '0'),
      target: def.evaluate({
        userId, walletAddress, burnAmount: 0,
        dailyBurnCount: 0, dailyVolume: 0, burnHourUTC: 0,
        currentStreak: 0, weeklyBurnDays: 0, weeklyVolume: 0, lifetimeBurned: 0,
        goldenBurnVolumeDelta: 0, goldenBurnCountDelta: 0,
      }).target,
      completed: p?.completed ?? false,
      xpAwarded: p?.xpAwarded ?? 0,
    };
  });

  const weekly = weeklyDefs.map(def => {
    const p = weeklyProgress.find(wp => wp.challengeId === def.id);
    const evalResult = def.id === 'grind_lord'
      ? { target: 20 }
      : def.evaluate({
          userId, walletAddress, burnAmount: 0,
          dailyBurnCount: 0, dailyVolume: 0, burnHourUTC: 0,
          currentStreak: 0, weeklyBurnDays: 0, weeklyVolume: 0, lifetimeBurned: 0,
          goldenBurnVolumeDelta: 0, goldenBurnCountDelta: 0,
        });
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      xpReward: def.xpReward,
      shieldReward: def.shieldReward ?? 0,
      progress: parseFloat(p?.progressValue ?? '0'),
      target: evalResult.target,
      completed: p?.completed ?? false,
      xpAwarded: p?.xpAwarded ?? 0,
    };
  });

  const allDailiesCompleted = daily.every(d => d.completed);

  return { daily, weekly, dailySweep: allDailiesCompleted, weekStart };
}
