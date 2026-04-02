/**
 * XP & Leveling engine.
 *
 * XP sources:
 *  - Daily burn: 100 XP (streak multiplier applied)
 *  - Badge earned: 500–5000 XP based on rarity tier
 *  - Daily challenge completed: 100–300 XP
 *  - Weekly challenge completed: 500–2000 XP
 *  - Daily sweep (all 3 dailies): 500 XP bonus
 *  - Lucky Burns: random drops with XP rewards
 *  - Level-up reward: free shield every 5 levels
 *
 * Level formula (infinite, gentle curve):
 *   XP for level N = 150 * N^1.2  (per-level cost)
 *   Cumulative XP for level N ≈ sum of 150*k^1.2 for k=1..N-1
 *
 *   Level 10:  ~8,500 XP    Level 30:   ~76,000 XP
 *   Level 50: ~230,000 XP   Level 100: ~1,000,000 XP
 *   Level 200: ~4,500,000 XP Level 500: ~28,000,000 XP  ∞ possible
 *
 * Streak multiplier: day 1–6 = 1.0x, 7–29 = 1.5x, 30–99 = 2.0x, 100+ = 3.0x
 */

import { eq, sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { users, xpLedger } from '../db/schema.js';
import { MAX_SHIELDS } from './shop.service.js';

// ── XP Constants ────────────────────────────────────────────

export const XP_PER_BURN = 100;

export const STREAK_MULTIPLIER_TIERS = [
  { minStreak: 100, multiplier: 3.0 },
  { minStreak: 30,  multiplier: 2.0 },
  { minStreak: 7,   multiplier: 1.5 },
  { minStreak: 0,   multiplier: 1.0 },
] as const;

/** Badge XP by type+threshold tier */
export const BADGE_XP: Record<string, number> = {
  // Streak badges
  STREAK_1: 500, STREAK_3: 500, STREAK_7: 750, STREAK_14: 1000,
  STREAK_21: 1000, STREAK_30: 1500, STREAK_60: 2000, STREAK_90: 2500,
  STREAK_180: 3000, STREAK_365: 4000, STREAK_500: 4500, STREAK_730: 5000,
  STREAK_1000: 5000, STREAK_1500: 5000,
  // Lifetime badges
  BURN_10: 500, BURN_50: 500, BURN_100: 750, BURN_500: 1000,
  BURN_1000: 1500, BURN_2500: 2000, BURN_5000: 2500, BURN_10000: 3000,
  BURN_25000: 3500, BURN_50000: 4000, BURN_100000: 4500, BURN_250000: 5000,
  BURN_500000: 5000, BURN_1000000: 5000,
  // Daily volume
  DAILY_25: 500, DAILY_100: 750, DAILY_500: 1500, DAILY_2500: 3000, DAILY_10000: 5000,
  // Tx count
  TXCOUNT_10: 500, TXCOUNT_50: 750, TXCOUNT_100: 1500, TXCOUNT_500: 3000, TXCOUNT_1000: 5000,
  // Perfect months
  PERFECT_1: 1000, PERFECT_3: 2000, PERFECT_6: 3500, PERFECT_12: 5000,
};

export const DAILY_SWEEP_BONUS_XP = 500;

// ── Level titles — infinite tiers ───────────────────────────

export const LEVEL_TITLES = [
  // ── MYTHIC (5000+) ──
  { minLevel: 5000, title: 'The Burn' },
  { minLevel: 3000, title: 'God Flame' },
  { minLevel: 2000, title: 'Immortal' },
  { minLevel: 1500, title: 'Mythic' },
  // ── LEGENDARY (500–1000) ──
  { minLevel: 1000, title: 'Legend' },
  { minLevel: 900,  title: 'Absolute Zero' },
  { minLevel: 750,  title: 'Burn Deity' },
  { minLevel: 600,  title: 'Multiverse' },
  { minLevel: 500,  title: 'Singularity' },
  { minLevel: 450,  title: 'Cosmic Void' },
  { minLevel: 400,  title: 'Omega Flame' },
  { minLevel: 350,  title: 'Transcendence' },
  { minLevel: 300,  title: 'Void Burner' },
  { minLevel: 275,  title: 'Quantum Burn' },
  { minLevel: 250,  title: 'Genesis Blaze' },
  { minLevel: 225,  title: 'Astral Fire' },
  // ── EPIC (100–200) ──
  { minLevel: 200,  title: 'Eternal Flame' },
  { minLevel: 185,  title: 'Primordial' },
  { minLevel: 175,  title: 'Primal Fire' },
  { minLevel: 160,  title: 'Dimension Burn' },
  { minLevel: 150,  title: 'Cosmic Burn' },
  { minLevel: 140,  title: 'Starforger' },
  { minLevel: 130,  title: 'World Blaze' },
  { minLevel: 120,  title: 'Galactic Flame' },
  { minLevel: 110,  title: 'Nova King' },
  { minLevel: 105,  title: 'Neutron Star' },
  { minLevel: 100,  title: 'Entropy' },
  { minLevel: 95,   title: 'Dark Matter' },
  // ── RARE (50–100) ──
  { minLevel: 90,   title: 'Plasma Core' },
  { minLevel: 85,   title: 'Thermonuclear' },
  { minLevel: 80,   title: 'Meltdown' },
  { minLevel: 75,   title: 'Obsidian' },
  { minLevel: 70,   title: 'Ash God' },
  { minLevel: 65,   title: 'Magma Lord' },
  { minLevel: 60,   title: 'Solar Flare' },
  { minLevel: 55,   title: 'Stellar Core' },
  { minLevel: 50,   title: 'Supernova' },
  // ── UNCOMMON (20–50) ──
  { minLevel: 45,   title: 'Pyroclasm' },
  { minLevel: 40,   title: 'Hellfire' },
  { minLevel: 35,   title: 'Firestorm' },
  { minLevel: 30,   title: 'Inferno' },
  { minLevel: 25,   title: 'Wildfire' },
  { minLevel: 20,   title: 'Blaze' },
  // ── COMMON (1–20) ──
  { minLevel: 16,   title: 'Flame' },
  { minLevel: 12,   title: 'Kindling' },
  { minLevel: 8,    title: 'Ember' },
  { minLevel: 5,    title: 'Spark' },
  { minLevel: 3,    title: 'Cinder' },
  { minLevel: 1,    title: 'Ash' },
] as const;

// ── Level math (infinite soft-exponential) ──────────────────

/**
 * XP cost for a single level (to go from level N to N+1).
 * Uses 150 * N^1.2 — gentle curve that rewards consistent play.
 */
function xpCostForSingleLevel(n: number): number {
  return Math.round(150 * Math.pow(n, 1.2));
}

/** Total XP required to reach level N (cumulative). Level 1 = 0 XP. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let k = 1; k < level; k++) {
    total += xpCostForSingleLevel(k);
  }
  return total;
}

/** Compute level from total XP via binary search (works for any level). */
export function levelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 1;
  let lo = 1;
  let hi = 2;
  // Double hi until xpForLevel(hi) > totalXp
  while (xpForLevel(hi) <= totalXp) hi *= 2;
  // Binary search between lo and hi
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (xpForLevel(mid) <= totalXp) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** XP needed to go from current level to next. */
export function xpToNextLevel(totalXp: number): { currentLevel: number; xpIntoLevel: number; xpNeeded: number } {
  const currentLevel = levelFromXp(totalXp);
  const currentLevelXp = xpForLevel(currentLevel);
  const nextLevelXp = xpForLevel(currentLevel + 1);
  return {
    currentLevel,
    xpIntoLevel: totalXp - currentLevelXp,
    xpNeeded: nextLevelXp - currentLevelXp,
  };
}

export function getStreakMultiplier(streak: number): number {
  for (const tier of STREAK_MULTIPLIER_TIERS) {
    if (streak >= tier.minStreak) return tier.multiplier;
  }
  return 1.0;
}

export function getLevelTitle(level: number): string {
  for (const t of LEVEL_TITLES) {
    if (level >= t.minLevel) return t.title;
  }
  return 'Spark';
}

// ── XP granting ─────────────────────────────────────────────

interface XpGrant {
  userId: string;
  amount: number;
  reason: string;
  refId?: string;
}

/**
 * Award XP to a user — updates users.xp + users.level, inserts ledger entry.
 * Returns the new total XP and level + whether a level-up occurred + shields earned.
 */
export async function grantXp(
  grant: XpGrant,
  txn?: DB,
): Promise<{ newXp: number; newLevel: number; leveledUp: boolean; shieldsAwarded: number }> {
  const executor = txn ?? db;

  // Insert ledger entry
  await executor.insert(xpLedger).values({
    userId: grant.userId,
    amount: grant.amount,
    reason: grant.reason,
    refId: grant.refId,
  });

  // Update user XP
  const [updated] = await executor
    .update(users)
    .set({
      xp: sql`${users.xp} + ${grant.amount}`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, grant.userId))
    .returning({ xp: users.xp, level: users.level, streakShields: users.streakShields });

  if (!updated) return { newXp: 0, newLevel: 1, leveledUp: false, shieldsAwarded: 0 };

  const newXp = Number(updated.xp);
  const newLevel = levelFromXp(newXp);
  const oldLevel = updated.level;
  let shieldsAwarded = 0;

  if (newLevel > oldLevel) {
    // Check how many shield rewards between old and new level (every 5 levels)
    for (let l = oldLevel + 1; l <= newLevel; l++) {
      if (l % 5 === 0) shieldsAwarded++;
    }

    await executor
      .update(users)
      .set({
        level: newLevel,
        streakShields: sql`LEAST(${users.streakShields} + ${shieldsAwarded}, ${MAX_SHIELDS})`,
        ...(shieldsAwarded > 0 ? { streakShieldActive: true } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, grant.userId));
  }

  return { newXp, newLevel, leveledUp: newLevel > oldLevel, shieldsAwarded };
}

/**
 * Award XP for a burn. Called inside the burn transaction.
 */
export async function grantBurnXp(
  userId: string,
  streak: number,
  burnId: string,
  txn: DB,
  buffMultiplier = 1,
): Promise<{ xpEarned: number; newXp: number; newLevel: number; leveledUp: boolean; shieldsAwarded: number }> {
  const multiplier = getStreakMultiplier(streak);
  const xpEarned = Math.round(XP_PER_BURN * multiplier * buffMultiplier);

  const result = await grantXp({
    userId,
    amount: xpEarned,
    reason: 'BURN',
    refId: burnId,
  }, txn);

  return { xpEarned, ...result };
}

/**
 * Award XP for earning a badge. Called inside the burn transaction.
 */
export async function grantBadgeXp(
  userId: string,
  badgeId: string,
  txn: DB,
): Promise<{ xpEarned: number }> {
  const xpEarned = BADGE_XP[badgeId] ?? 500;

  await grantXp({
    userId,
    amount: xpEarned,
    reason: 'BADGE_EARNED',
    refId: badgeId,
  }, txn);

  return { xpEarned };
}
