/**
 * Retroactive XP calculation for existing users.
 *
 * Awards XP for:
 *  1. Every verified burn (100 XP × streak multiplier at time of burn)
 *  2. Every earned badge (BADGE_XP[badgeId])
 *  3. Updates user.xp and user.level
 *
 * Safe to run multiple times — checks for existing RETROACTIVE ledger entries.
 *
 * Usage: npx tsx scripts/backfill-xp.ts
 */

import 'dotenv/config';
import postgres from 'postgres';
import { env } from '../src/config/env.js';
import {
  BADGE_XP, XP_PER_BURN, getStreakMultiplier, levelFromXp,
} from '../src/services/xp.service.js';

async function backfillXp() {
  const sql = postgres(env.DATABASE_URL);

  console.log('Starting retroactive XP backfill...');

  // Check if already run
  const [existing] = await sql`
    SELECT COUNT(*)::int AS cnt FROM xp_ledger WHERE reason = 'RETROACTIVE' LIMIT 1
  `;
  if (existing && existing.cnt > 0) {
    console.log(`Found ${existing.cnt} existing RETROACTIVE entries. Skipping backfill.`);
    console.log('To re-run, first: DELETE FROM xp_ledger WHERE reason = \'RETROACTIVE\'');
    await sql.end();
    return;
  }

  // Get all users
  const users = await sql`SELECT id, wallet_address FROM users ORDER BY created_at`;
  console.log(`Processing ${users.length} users...`);

  let totalXpAwarded = 0;

  for (const user of users) {
    let userXp = 0;

    // 1. XP for each verified burn (using the streak_day recorded at burn time)
    const burns = await sql`
      SELECT id, streak_day FROM burns
      WHERE user_id = ${user.id} AND status = 'VERIFIED'
      ORDER BY created_at
    `;

    for (const burn of burns) {
      const multiplier = getStreakMultiplier(burn.streak_day);
      const xp = Math.round(XP_PER_BURN * multiplier);
      userXp += xp;
    }

    // 2. XP for each earned badge
    const badges = await sql`
      SELECT badge_id FROM badges WHERE user_id = ${user.id}
    `;

    for (const badge of badges) {
      const xp = BADGE_XP[badge.badge_id] ?? 500;
      userXp += xp;
    }

    if (userXp > 0) {
      const level = levelFromXp(userXp);

      // Insert single retroactive ledger entry
      await sql`
        INSERT INTO xp_ledger (user_id, amount, reason, ref_id)
        VALUES (${user.id}, ${userXp}, 'RETROACTIVE', ${'backfill-' + new Date().toISOString()})
      `;

      // Compute shield rewards for levels crossed (every 5 levels)
      let shieldsFromLevels = 0;
      for (let l = 1; l <= level; l++) {
        if (l % 5 === 0) shieldsFromLevels++;
      }

      // Update user
      await sql`
        UPDATE users
        SET xp = ${userXp},
            level = ${level},
            streak_shields = GREATEST(streak_shields, 0) + ${shieldsFromLevels},
            updated_at = NOW()
        WHERE id = ${user.id}
      `;

      console.log(`  ${user.wallet_address}: ${userXp} XP → Level ${level} (${burns.length} burns, ${badges.length} badges, +${shieldsFromLevels} shields)`);
      totalXpAwarded += userXp;
    }
  }

  console.log(`\nDone! Total XP awarded: ${totalXpAwarded} across ${users.length} users.`);
  await sql.end();
}

backfillXp().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
