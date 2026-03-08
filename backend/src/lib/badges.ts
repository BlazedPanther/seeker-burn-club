/**
 * Badge & milestone definitions.
 * These are application-level constants, not stored in the database.
 */

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  type: 'streak' | 'lifetime' | 'daily' | 'txcount' | 'perfect';
  threshold: number;
  emoji: string;
}

export const STREAK_MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365, 500, 730, 1000, 1500] as const;
export const LIFETIME_MILESTONES = [10, 50, 100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000] as const;
export const DAILY_MILESTONES = [25, 100, 500, 2500, 10000] as const;
export const TXCOUNT_MILESTONES = [10, 50, 100, 500, 1000] as const;
export const PERFECT_MILESTONES = [1, 3, 6, 12] as const;

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ── Streak badges (14 total) ─────────────────────────────────────────────
  { id: 'STREAK_1',    name: 'First Flame',    description: 'Complete your first burn',       type: 'streak', threshold: 1,    emoji: '🔥' },
  { id: 'STREAK_3',    name: 'Kindling',        description: '3-day burn streak',              type: 'streak', threshold: 3,    emoji: '🔥' },
  { id: 'STREAK_7',    name: 'Torch Bearer',    description: '7-day burn streak',              type: 'streak', threshold: 7,    emoji: '🔥' },
  { id: 'STREAK_14',   name: 'Furnace',         description: '14-day burn streak',             type: 'streak', threshold: 14,   emoji: '🔥' },
  { id: 'STREAK_21',   name: 'Forge',           description: '21-day burn streak',             type: 'streak', threshold: 21,   emoji: '🔥' },
  { id: 'STREAK_30',   name: 'Inferno',         description: '30-day burn streak',             type: 'streak', threshold: 30,   emoji: '🔥' },
  { id: 'STREAK_60',   name: 'Blaze Master',    description: '60-day burn streak',             type: 'streak', threshold: 60,   emoji: '🔥' },
  { id: 'STREAK_90',   name: 'Eternal Flame',   description: '90-day burn streak',             type: 'streak', threshold: 90,   emoji: '🔥' },
  { id: 'STREAK_180',  name: 'Hellfire',        description: '180-day burn streak',            type: 'streak', threshold: 180,  emoji: '🔥' },
  { id: 'STREAK_365',  name: 'Phoenix',         description: '365-day burn streak',            type: 'streak', threshold: 365,  emoji: '🔥' },
  { id: 'STREAK_500',  name: 'Demon Lord',      description: '500-day burn streak',            type: 'streak', threshold: 500,  emoji: '🔥' },
  { id: 'STREAK_730',  name: 'Archfiend',       description: '730-day (2-year) burn streak',   type: 'streak', threshold: 730,  emoji: '🔥' },
  { id: 'STREAK_1000', name: 'Immortal',        description: '1,000-day burn streak',          type: 'streak', threshold: 1000, emoji: '👑' },
  { id: 'STREAK_1500', name: 'Eternal',         description: '1,500-day (4-year) burn streak', type: 'streak', threshold: 1500, emoji: '👑' },
  // ── Lifetime burn badges (14 total) ──────────────────────────────────────
  // SKR price ~$0.021 → thresholds tuned to real USD value
  { id: 'BURN_10',      name: 'Ember',           description: 'Burn 10 SKR (~$0.21)',           type: 'lifetime', threshold: 10,      emoji: '💎' },
  { id: 'BURN_50',      name: 'Blaze',           description: 'Burn 50 SKR (~$1)',              type: 'lifetime', threshold: 50,      emoji: '💎' },
  { id: 'BURN_100',     name: 'Wildfire',        description: 'Burn 100 SKR (~$2)',             type: 'lifetime', threshold: 100,     emoji: '💎' },
  { id: 'BURN_500',     name: 'Supernova',       description: 'Burn 500 SKR (~$10)',            type: 'lifetime', threshold: 500,     emoji: '💎' },
  { id: 'BURN_1000',    name: 'Singularity',     description: 'Burn 1,000 SKR (~$21)',          type: 'lifetime', threshold: 1000,    emoji: '💎' },
  { id: 'BURN_2500',    name: 'Devourer',        description: 'Burn 2,500 SKR (~$53)',          type: 'lifetime', threshold: 2500,    emoji: '💎' },
  { id: 'BURN_5000',    name: 'Destroyer',       description: 'Burn 5,000 SKR (~$106)',         type: 'lifetime', threshold: 5000,    emoji: '💎' },
  { id: 'BURN_10000',   name: 'Annihilator',     description: 'Burn 10,000 SKR (~$213)',        type: 'lifetime', threshold: 10000,   emoji: '🏆' },
  { id: 'BURN_25000',   name: 'Titan',           description: 'Burn 25,000 SKR (~$530)',        type: 'lifetime', threshold: 25000,   emoji: '🏆' },
  { id: 'BURN_50000',   name: 'Leviathan',       description: 'Burn 50,000 SKR (~$1,000)',      type: 'lifetime', threshold: 50000,   emoji: '🏆' },
  { id: 'BURN_100000',  name: 'God of Ashes',    description: 'Burn 100,000 SKR (~$2,100)',     type: 'lifetime', threshold: 100000,  emoji: '🏆' },
  { id: 'BURN_250000',  name: 'World Breaker',   description: 'Burn 250,000 SKR (~$5,300)',     type: 'lifetime', threshold: 250000,  emoji: '👑' },
  { id: 'BURN_500000',  name: 'Oblivion',        description: 'Burn 500,000 SKR (~$10,600)',    type: 'lifetime', threshold: 500000,  emoji: '👑' },
  { id: 'BURN_1000000', name: 'The Absolute',    description: 'Burn 1,000,000 SKR (~$21,000)',  type: 'lifetime', threshold: 1000000, emoji: '👑' },
  // ── Daily volume badges (5 total) ──────────────────────────────────────
  // Burn X SKR in a single UTC day
  { id: 'DAILY_25',    name: 'Hot Hands',      description: 'Burn 25 SKR in one day (~$0.60)',   type: 'daily', threshold: 25,    emoji: '⚡' },
  { id: 'DAILY_100',   name: 'Firestarter',    description: 'Burn 100 SKR in one day (~$2.40)',  type: 'daily', threshold: 100,   emoji: '⚡' },
  { id: 'DAILY_500',   name: 'Pyromaniac',     description: 'Burn 500 SKR in one day (~$12)',    type: 'daily', threshold: 500,   emoji: '⚡' },
  { id: 'DAILY_2500',  name: 'Eruption',       description: 'Burn 2,500 SKR in one day (~$60)',  type: 'daily', threshold: 2500,  emoji: '⚡' },
  { id: 'DAILY_10000', name: 'Cataclysm',      description: 'Burn 10,000 SKR in one day (~$240)',type: 'daily', threshold: 10000, emoji: '⚡' },
  // ── Total burn count badges (5 total) ─────────────────────────────────
  // Number of individual burn transactions completed
  { id: 'TXCOUNT_10',  name: 'Spark Plug',     description: 'Complete 10 burns',                 type: 'txcount', threshold: 10,   emoji: '🎯' },
  { id: 'TXCOUNT_50',  name: 'Fire Hydrant',   description: 'Complete 50 burns',                 type: 'txcount', threshold: 50,   emoji: '🎯' },
  { id: 'TXCOUNT_100', name: 'Burn Machine',    description: 'Complete 100 burns',                type: 'txcount', threshold: 100,  emoji: '🎯' },
  { id: 'TXCOUNT_500', name: 'Incinerator',     description: 'Complete 500 burns',                type: 'txcount', threshold: 500,  emoji: '🎯' },
  { id: 'TXCOUNT_1000',name: 'Crematorium',     description: 'Complete 1,000 burns',              type: 'txcount', threshold: 1000, emoji: '🎯' },
  // ── Perfect month badges (4 total) ────────────────────────────────────
  // Burn every single day of a calendar month
  { id: 'PERFECT_1',   name: 'Flawless',       description: 'Complete 1 perfect month',          type: 'perfect', threshold: 1,    emoji: '💯' },
  { id: 'PERFECT_3',   name: 'Disciplined',    description: 'Complete 3 perfect months',         type: 'perfect', threshold: 3,    emoji: '💯' },
  { id: 'PERFECT_6',   name: 'Relentless',     description: 'Complete 6 perfect months',         type: 'perfect', threshold: 6,    emoji: '💯' },
  { id: 'PERFECT_12',  name: 'Unbreakable',    description: 'Complete 12 perfect months',        type: 'perfect', threshold: 12,   emoji: '💯' },
];

export function getBadgeById(id: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find(b => b.id === id);
}

/**
 * Check for newly earned badges given the user's current streak and lifetime burned amount.
 */
export function checkMilestones(
  newStreak: number,
  newLifetimeBurned: number,
  alreadyEarnedIds: Set<string>,
  dailyVolume?: number,
  totalBurnCount?: number,
  perfectMonths?: number,
): BadgeDefinition[] {
  const newBadges: BadgeDefinition[] = [];

  for (const milestone of STREAK_MILESTONES) {
    const badgeId = `STREAK_${milestone}`;
    if (newStreak >= milestone && !alreadyEarnedIds.has(badgeId)) {
      const def = BADGE_DEFINITIONS.find(b => b.id === badgeId);
      if (def) newBadges.push(def);
    }
  }

  for (const milestone of LIFETIME_MILESTONES) {
    const badgeId = `BURN_${milestone}`;
    if (newLifetimeBurned >= milestone && !alreadyEarnedIds.has(badgeId)) {
      const def = BADGE_DEFINITIONS.find(b => b.id === badgeId);
      if (def) newBadges.push(def);
    }
  }

  if (dailyVolume != null) {
    for (const milestone of DAILY_MILESTONES) {
      const badgeId = `DAILY_${milestone}`;
      if (dailyVolume >= milestone && !alreadyEarnedIds.has(badgeId)) {
        const def = BADGE_DEFINITIONS.find(b => b.id === badgeId);
        if (def) newBadges.push(def);
      }
    }
  }

  if (totalBurnCount != null) {
    for (const milestone of TXCOUNT_MILESTONES) {
      const badgeId = `TXCOUNT_${milestone}`;
      if (totalBurnCount >= milestone && !alreadyEarnedIds.has(badgeId)) {
        const def = BADGE_DEFINITIONS.find(b => b.id === badgeId);
        if (def) newBadges.push(def);
      }
    }
  }

  if (perfectMonths != null) {
    for (const milestone of PERFECT_MILESTONES) {
      const badgeId = `PERFECT_${milestone}`;
      if (perfectMonths >= milestone && !alreadyEarnedIds.has(badgeId)) {
        const def = BADGE_DEFINITIONS.find(b => b.id === badgeId);
        if (def) newBadges.push(def);
      }
    }
  }

  return newBadges;
}
