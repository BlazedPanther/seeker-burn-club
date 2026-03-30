/**
 * Lucky Burns — random item drop system.
 *
 * After every burn, the user has a chance to receive a random item.
 * Drop chance scales with streak (higher streak = better luck).
 *
 * ── Rarity tiers ──
 *  Common     — 45% of drops  (easy to get)
 *  Uncommon   — 25% of drops
 *  Rare       — 15% of drops
 *  Epic       — 10% of drops  (hard to get)
 *  Legendary  —  4% of drops  (very hard)
 *  Mythic     —  1% of drops  (ultra rare)
 *
 * ── Base drop chance ──
 *  Streak  0–6:   8%  per burn
 *  Streak  7–29: 12%  per burn
 *  Streak 30–99: 18%  per burn
 *  Streak 100+:  25%  per burn
 *
 * ── Items ──
 * Each item has: id, name, description, rarity, effect type, effect value.
 * Some are instant (applied immediately), some go to inventory for manual use.
 */

import { eq, and, sql, gt, or, isNull, gte } from 'drizzle-orm';
import { type DB, db } from '../db/client.js';
import { luckyDrops, activeBuffs, userInventory, users } from '../db/schema.js';
import { grantXp } from './xp.service.js';
import { MAX_SHIELDS } from './shop.service.js';

// ── Drop chance by streak ───────────────────────────────────

const DROP_CHANCE_TIERS = [
  { minStreak: 100, chance: 0.25 },
  { minStreak: 30,  chance: 0.18 },
  { minStreak: 7,   chance: 0.12 },
  { minStreak: 0,   chance: 0.08 },
] as const;

function getDropChance(streak: number): number {
  for (const tier of DROP_CHANCE_TIERS) {
    if (streak >= tier.minStreak) return tier.chance;
  }
  return 0.08;
}

// ── Rarity weights (must sum to 100) ────────────────────────

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

const RARITY_WEIGHTS: Array<{ rarity: Rarity; weight: number; cumulative: number }> = [
  { rarity: 'COMMON',    weight: 45, cumulative: 45 },
  { rarity: 'UNCOMMON',  weight: 25, cumulative: 70 },
  { rarity: 'RARE',      weight: 15, cumulative: 85 },
  { rarity: 'EPIC',      weight: 10, cumulative: 95 },
  { rarity: 'LEGENDARY', weight: 4,  cumulative: 99 },
  { rarity: 'MYTHIC',    weight: 1,  cumulative: 100 },
];

function rollRarity(): Rarity {
  const roll = Math.random() * 100;
  for (const tier of RARITY_WEIGHTS) {
    if (roll < tier.cumulative) return tier.rarity;
  }
  return 'COMMON';
}

// ── Item definitions ────────────────────────────────────────

export type EffectType =
  | 'INSTANT_XP'       // Immediate XP grant
  | 'XP_BOOST'         // Next N burns get multiplied XP
  | 'STREAK_SHIELD'    // Free streak shield(s)
  | 'CHALLENGE_SKIP'   // Complete a random active daily challenge
  | 'GOLDEN_BURN'      // Next burn counts Nx for challenges
  | 'LOOT_LUCK'        // Increased drop chance for next N burns
  | 'STREAK_FREEZE'    // Extends shield duration
  | 'TITLE_UNLOCK'     // Unique profile title
  | 'BONUS_BADGE_XP';  // Next badge earned gives bonus XP

export interface LuckyItem {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  emoji: string;
  effect: EffectType;
  effectValue: number;      // Amount or multiplier
  effectDuration?: number;  // Number of uses/burns the effect lasts
  instant: boolean;         // true = applied immediately, false = goes to inventory
}

export const LUCKY_ITEMS: LuckyItem[] = [
  // ── COMMON (45%) ──
  {
    id: 'xp_spark',
    name: 'XP Spark',
    description: 'A small spark of energy. +150 XP instantly.',
    rarity: 'COMMON', emoji: '✨',
    effect: 'INSTANT_XP', effectValue: 150, instant: true,
  },
  {
    id: 'xp_ember',
    name: 'Ember Fragment',
    description: 'Glowing ember full of power. +300 XP instantly.',
    rarity: 'COMMON', emoji: '🔸',
    effect: 'INSTANT_XP', effectValue: 300, instant: true,
  },
  {
    id: 'mini_boost',
    name: 'Mini Boost',
    description: 'Next burn gives 1.5x XP.',
    rarity: 'COMMON', emoji: '⚡',
    effect: 'XP_BOOST', effectValue: 1.5, effectDuration: 1, instant: true,
  },

  // ── UNCOMMON (25%) ──
  {
    id: 'streak_shield_drop',
    name: 'Streak Shield',
    description: '+1 Streak Shield. Protects your streak.',
    rarity: 'UNCOMMON', emoji: '🛡️',
    effect: 'STREAK_SHIELD', effectValue: 1, instant: true,
  },
  {
    id: 'xp_flame',
    name: 'Flame Essence',
    description: 'Burning energy. +500 XP instantly.',
    rarity: 'UNCOMMON', emoji: '🔥',
    effect: 'INSTANT_XP', effectValue: 500, instant: true,
  },
  {
    id: 'lucky_charm',
    name: 'Lucky Charm',
    description: 'Next 3 burns: double drop chance.',
    rarity: 'UNCOMMON', emoji: '🍀',
    effect: 'LOOT_LUCK', effectValue: 2, effectDuration: 3, instant: true,
  },

  // ── RARE (15%) ──
  {
    id: 'xp_inferno',
    name: 'Inferno Core',
    description: 'Explosive energy core. +1000 XP instantly.',
    rarity: 'RARE', emoji: '💎',
    effect: 'INSTANT_XP', effectValue: 1000, instant: true,
  },
  {
    id: 'double_boost',
    name: 'Double Boost',
    description: 'Next 3 burns give 2x XP.',
    rarity: 'RARE', emoji: '⚡⚡',
    effect: 'XP_BOOST', effectValue: 2, effectDuration: 3, instant: true,
  },
  {
    id: 'challenge_skip',
    name: 'Challenge Pass',
    description: 'Instantly completes an active Daily Challenge.',
    rarity: 'RARE', emoji: '🎫',
    effect: 'CHALLENGE_SKIP', effectValue: 1, instant: false,
  },

  // ── EPIC (10%) ──
  {
    id: 'golden_burn',
    name: 'Golden Burn',
    description: 'Next burn counts 5x for all Challenges.',
    rarity: 'EPIC', emoji: '👑',
    effect: 'GOLDEN_BURN', effectValue: 5, effectDuration: 1, instant: true,
  },
  {
    id: 'shield_pack',
    name: 'Shield Arsenal',
    description: '+3 Streak Shields at once.',
    rarity: 'EPIC', emoji: '🛡️🛡️🛡️',
    effect: 'STREAK_SHIELD', effectValue: 3, instant: true,
  },
  {
    id: 'xp_supernova',
    name: 'Supernova',
    description: 'Massive explosion. +2500 XP instantly.',
    rarity: 'EPIC', emoji: '💥',
    effect: 'INSTANT_XP', effectValue: 2500, instant: true,
  },

  // ── LEGENDARY (4%) ──
  {
    id: 'triple_boost',
    name: 'Triple Fire',
    description: 'Next 5 burns give 3x XP!',
    rarity: 'LEGENDARY', emoji: '🔱',
    effect: 'XP_BOOST', effectValue: 3, effectDuration: 5, instant: true,
  },
  {
    id: 'entropy_flame',
    name: 'Entropy Flame',
    description: '+5000 XP instantly. The flame of destruction.',
    rarity: 'LEGENDARY', emoji: '🌋',
    effect: 'INSTANT_XP', effectValue: 5000, instant: true,
  },
  {
    id: 'mega_luck',
    name: 'Mega Luck',
    description: 'Next 10 burns: triple drop chance.',
    rarity: 'LEGENDARY', emoji: '🌟',
    effect: 'LOOT_LUCK', effectValue: 3, effectDuration: 10, instant: true,
  },

  // ── MYTHIC (1%) ──
  {
    id: 'singularity_core',
    name: 'Singularity Core',
    description: '+10000 XP. The rarest essence in the universe.',
    rarity: 'MYTHIC', emoji: '🌀',
    effect: 'INSTANT_XP', effectValue: 10000, instant: true,
  },
  {
    id: 'eternal_flame',
    name: 'Eternal Flame',
    description: 'All burns give 2x XP for 7 days.',
    rarity: 'MYTHIC', emoji: '♾️🔥',
    effect: 'XP_BOOST', effectValue: 2, effectDuration: 7, instant: true,
  },
];

// Build a lookup map by rarity for fast random selection
const ITEMS_BY_RARITY = new Map<Rarity, LuckyItem[]>();
for (const item of LUCKY_ITEMS) {
  const list = ITEMS_BY_RARITY.get(item.rarity) ?? [];
  list.push(item);
  ITEMS_BY_RARITY.set(item.rarity, list);
}

function pickItemForRarity(rarity: Rarity): LuckyItem {
  const items = ITEMS_BY_RARITY.get(rarity) ?? ITEMS_BY_RARITY.get('COMMON')!;
  return items[Math.floor(Math.random() * items.length)];
}

// ── Public interface ────────────────────────────────────────

export interface LuckyDropResult {
  dropped: boolean;
  item?: {
    id: string;
    name: string;
    description: string;
    rarity: Rarity;
    emoji: string;
    effectDescription: string;
  };
  xpAwarded?: number;
  shieldsAwarded?: number;
}

/**
 * Roll for a lucky drop after a burn. Called inside the burn transaction.
 *
 * @param userId  User ID
 * @param burnId  Burn record ID (for dedup)
 * @param streak  Current streak at time of burn
 * @param txn     Database transaction
 */
export async function rollLuckyDrop(
  userId: string,
  burnId: string,
  streak: number,
  txn: DB,
): Promise<LuckyDropResult> {
  // Check for active LOOT_LUCK buff (increases drop chance)
  let dropChance = getDropChance(streak);
  const luckBuff = await txn
    .select()
    .from(activeBuffs)
    .where(and(
      eq(activeBuffs.userId, userId),
      eq(activeBuffs.buffType, 'LOOT_LUCK'),
      gt(activeBuffs.remainingUses, 0),
      or(isNull(activeBuffs.expiresAt), gte(activeBuffs.expiresAt, new Date())),
    ))
    .orderBy(sql`${activeBuffs.createdAt} ASC`)
    .limit(1);

  if (luckBuff.length > 0) {
    const multiplier = (luckBuff[0].metadata as { value?: number })?.value ?? 2;
    dropChance = Math.min(dropChance * multiplier, 0.80); // Cap at 80%
    // Decrement buff
    await txn
      .update(activeBuffs)
      .set({ remainingUses: sql`${activeBuffs.remainingUses} - 1` })
      .where(eq(activeBuffs.id, luckBuff[0].id));
  }

  // Roll the dice
  if (Math.random() > dropChance) {
    return { dropped: false };
  }

  // Pick rarity then item
  const rarity = rollRarity();
  const item = pickItemForRarity(rarity);

  // Record the drop
  await txn.insert(luckyDrops).values({
    userId,
    burnId,
    itemId: item.id,
    rarity: item.rarity,
    applied: item.instant,
  });

  let xpAwarded = 0;
  let shieldsAwarded = 0;

  // Apply instant effects
  if (item.instant) {
    switch (item.effect) {
      case 'INSTANT_XP': {
        xpAwarded = item.effectValue;
        await grantXp({
          userId,
          amount: item.effectValue,
          reason: 'LUCKY_DROP',
          refId: item.id,
        }, txn);
        break;
      }

      case 'STREAK_SHIELD': {
        shieldsAwarded = item.effectValue;
        await txn
          .update(users)
          .set({
            streakShields: sql`LEAST(${users.streakShields} + ${item.effectValue}, ${MAX_SHIELDS})`,
            streakShieldActive: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
        break;
      }

      case 'XP_BOOST': {
        // For Eternal Flame (MYTHIC) — effectDuration is in days, use expiresAt as the real limiter
        const isTimeBased = item.rarity === 'MYTHIC';
        await txn.insert(activeBuffs).values({
          userId,
          buffType: 'XP_BOOST',
          remainingUses: isTimeBased ? 999999 : item.effectDuration!,
          metadata: { multiplier: item.effectValue },
          expiresAt: isTimeBased
            ? new Date(Date.now() + (item.effectDuration! * 24 * 60 * 60 * 1000))
            : null,
        });
        break;
      }

      case 'GOLDEN_BURN': {
        await txn.insert(activeBuffs).values({
          userId,
          buffType: 'GOLDEN_BURN',
          remainingUses: item.effectDuration!,
          metadata: { multiplier: item.effectValue },
        });
        break;
      }

      case 'LOOT_LUCK': {
        await txn.insert(activeBuffs).values({
          userId,
          buffType: 'LOOT_LUCK',
          remainingUses: item.effectDuration!,
          metadata: { value: item.effectValue },
        });
        break;
      }

      default:
        break;
    }
  } else {
    // Non-instant: add to inventory
    await txn.execute(sql`
      INSERT INTO user_inventory (user_id, item_id, quantity)
      VALUES (${userId}, ${item.id}, 1)
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET quantity = user_inventory.quantity + 1, updated_at = NOW()
    `);
  }

  return {
    dropped: true,
    item: {
      id: item.id,
      name: item.name,
      description: item.description,
      rarity: item.rarity,
      emoji: item.emoji,
      effectDescription: formatEffect(item),
    },
    xpAwarded: xpAwarded > 0 ? xpAwarded : undefined,
    shieldsAwarded: shieldsAwarded > 0 ? shieldsAwarded : undefined,
  };
}

/**
 * Check for and consume an XP_BOOST buff before granting burn XP.
 * Returns the XP multiplier to apply (default 1.0).
 */
export async function consumeXpBoost(userId: string, txn: DB): Promise<number> {
  const buff = await txn
    .select()
    .from(activeBuffs)
    .where(and(
      eq(activeBuffs.userId, userId),
      eq(activeBuffs.buffType, 'XP_BOOST'),
      gt(activeBuffs.remainingUses, 0),
      or(isNull(activeBuffs.expiresAt), gte(activeBuffs.expiresAt, new Date())),
    ))
    .orderBy(sql`${activeBuffs.createdAt} ASC`)
    .limit(1);

  if (buff.length === 0) return 1.0;

  const multiplier = (buff[0].metadata as { multiplier?: number })?.multiplier ?? 1.0;

  // Decrement uses
  await txn
    .update(activeBuffs)
    .set({ remainingUses: sql`${activeBuffs.remainingUses} - 1` })
    .where(eq(activeBuffs.id, buff[0].id));

  return multiplier;
}

/**
 * Check for and consume a GOLDEN_BURN buff.
 * Returns challenge multiplier (default 1).
 */
export async function consumeGoldenBurn(userId: string, txn: DB): Promise<number> {
  const buff = await txn
    .select()
    .from(activeBuffs)
    .where(and(
      eq(activeBuffs.userId, userId),
      eq(activeBuffs.buffType, 'GOLDEN_BURN'),
      gt(activeBuffs.remainingUses, 0),
      or(isNull(activeBuffs.expiresAt), gte(activeBuffs.expiresAt, new Date())),
    ))
    .orderBy(sql`${activeBuffs.createdAt} ASC`)
    .limit(1);

  if (buff.length === 0) return 1;

  const multiplier = (buff[0].metadata as { multiplier?: number })?.multiplier ?? 1;

  await txn
    .update(activeBuffs)
    .set({ remainingUses: sql`${activeBuffs.remainingUses} - 1` })
    .where(eq(activeBuffs.id, buff[0].id));

  return multiplier;
}

/**
 * Get user's inventory items.
 */
export async function getUserInventory(userId: string) {
  const items = await db
    .select()
    .from(userInventory)
    .where(and(eq(userInventory.userId, userId), gt(userInventory.quantity, 0)));

  return items.map(row => {
    const def = LUCKY_ITEMS.find(i => i.id === row.itemId);
    return {
      itemId: row.itemId,
      name: def?.name ?? row.itemId,
      description: def?.description ?? '',
      emoji: def?.emoji ?? '📦',
      rarity: def?.rarity ?? 'COMMON',
      quantity: row.quantity,
    };
  });
}

/**
 * Get user's active buffs.
 */
export async function getUserBuffs(userId: string) {
  const buffs = await db
    .select()
    .from(activeBuffs)
    .where(and(
      eq(activeBuffs.userId, userId),
      gt(activeBuffs.remainingUses, 0),
      or(isNull(activeBuffs.expiresAt), gte(activeBuffs.expiresAt, sql`NOW()`)),
    ));

  return buffs.map(b => ({
    buffType: b.buffType,
    remainingUses: b.remainingUses,
    metadata: b.metadata,
    expiresAt: b.expiresAt?.toISOString() ?? null,
  }));
}

/**
 * Get user's recent lucky drops.
 */
export async function getRecentDrops(userId: string, limit = 20) {
  const drops = await db
    .select()
    .from(luckyDrops)
    .where(eq(luckyDrops.userId, userId))
    .orderBy(sql`${luckyDrops.createdAt} DESC`)
    .limit(limit);

  return drops.map(d => {
    const def = LUCKY_ITEMS.find(i => i.id === d.itemId);
    return {
      id: d.id,
      itemId: d.itemId,
      name: def?.name ?? d.itemId,
      emoji: def?.emoji ?? '📦',
      rarity: d.rarity,
      applied: d.applied,
      createdAt: d.createdAt.toISOString(),
    };
  });
}

// ── All items catalog (for client display) ──────────────────

export function getItemCatalog() {
  return LUCKY_ITEMS.map(i => ({
    id: i.id,
    name: i.name,
    description: i.description,
    rarity: i.rarity,
    emoji: i.emoji,
    dropChance: getRarityDropInfo(i.rarity),
  }));
}

function getRarityDropInfo(rarity: Rarity): string {
  const tier = RARITY_WEIGHTS.find(r => r.rarity === rarity);
  return tier ? `${tier.weight}% of drops` : '?';
}

function formatEffect(item: LuckyItem): string {
  switch (item.effect) {
    case 'INSTANT_XP': return `+${item.effectValue} XP`;
    case 'XP_BOOST':
      return item.rarity === 'MYTHIC'
        ? `${item.effectValue}x XP for ${item.effectDuration} days`
        : `${item.effectValue}x XP for ${item.effectDuration} burn${item.effectDuration! > 1 ? 's' : ''}`;
    case 'STREAK_SHIELD': return `+${item.effectValue} Streak Shield${item.effectValue > 1 ? 's' : ''}`;
    case 'CHALLENGE_SKIP': return 'Instantly complete a Daily Challenge';
    case 'GOLDEN_BURN': return `${item.effectValue}x Challenge progress for ${item.effectDuration} burn${item.effectDuration! > 1 ? 's' : ''}`;
    case 'LOOT_LUCK': return `${item.effectValue}x drop chance for ${item.effectDuration} burns`;
    case 'TITLE_UNLOCK': return 'Exclusive profile title';
    case 'BONUS_BADGE_XP': return `+${item.effectValue}% Badge XP`;
    case 'STREAK_FREEZE': return `${item.effectValue} extra shield days`;
    default: return item.description;
  }
}
