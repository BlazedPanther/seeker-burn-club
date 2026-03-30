import { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, badges, burns } from '../db/schema.js';
import { todayUTC, yesterdayUTC } from '../lib/solana.js';
import { BADGE_DEFINITIONS } from '../lib/badges.js';
import { redis } from '../lib/redis.js';
import { xpToNextLevel, getLevelTitle } from '../services/xp.service.js';

/** Raw SQL rank result row. */
interface RankRow { rank: string }

export async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/profile
  fastify.get('/api/v1/profile', async (request, reply) => {
    const wallet = request.user.sub;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.walletAddress, wallet))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    }

    // ── Detect and persist broken streaks ──
    // The streak is only recalculated during burn verification, so if the user
    // missed a day and then opens the app, the DB still holds the stale value.
    // Fix: if lastBurnDate is before yesterday, the streak is broken.
    let streakBroken = false;
    let previousStreak = 0;
    let effectiveStreak = user.currentStreak;
    const today = todayUTC();
    const yesterday = yesterdayUTC(today);

    if (
      user.currentStreak > 0 &&
      user.lastBurnDate &&
      user.lastBurnDate !== today &&
      user.lastBurnDate !== yesterday &&
      user.streakShields <= 0
    ) {
      streakBroken = true;
      previousStreak = user.currentStreak;
      effectiveStreak = 0;
      // Persist the reset so we don't re-fire the "lost" banner on every refresh.
      await db
        .update(users)
        .set({
          currentStreak: 0,
          streakBrokenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    // Parallel fetch: badges, today's burn, and ranks (all independent after user lookup)
    // Ranks are cached in Redis for 60s to avoid expensive COUNT(*) scans at scale
    const badgesPromise = db.select().from(badges).where(eq(badges.userId, user.id));
    const todayBurnPromise = db.select({ signature: burns.txSignature }).from(burns)
      .where(sql`${burns.walletAddress} = ${wallet} AND ${burns.burnDate} = ${today} AND ${burns.status} = 'VERIFIED'`)
      .limit(1);
    const dailyBurnPromise = db.execute(
      sql`SELECT
            COALESCE(SUM(burn_amount), 0)::text AS daily_burn_skr,
            COUNT(*)::int                       AS daily_burn_count
          FROM burns
          WHERE wallet_address = ${wallet}
            AND status = 'VERIFIED'
            AND burn_date = ${today}`,
    );

    // Weekly stats — ISO week starting Monday, UTC-based
    // DATE_TRUNC('week', ...) gives the Monday of the current UTC week
    const weeklyBurnPromise = db.execute(
      sql`SELECT
            COALESCE(SUM(burn_amount), 0)::text  AS weekly_burn_skr,
            COUNT(DISTINCT burn_date)::int        AS weekly_burn_days
          FROM burns
          WHERE wallet_address = ${wallet}
            AND status = 'VERIFIED'
            AND burn_date >= DATE_TRUNC('week', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`
    );
    const referralStatsPromise = db.execute(sql`
      SELECT
        COUNT(*)::int AS invited,
        COUNT(*) FILTER (WHERE status = 'QUALIFIED')::int AS qualified,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
      FROM referrals
      WHERE referrer_user_id = ${user.id}
    `);
    const totalBurnCountPromise = db.execute(
      sql`SELECT COUNT(*)::int AS total_burn_count
          FROM burns
          WHERE wallet_address = ${wallet}
            AND status = 'VERIFIED'`,
    );
    const perfectMonthsPromise = db.execute(sql`
      WITH monthly AS (
        SELECT DATE_TRUNC('month', burn_date::date) AS m,
               COUNT(DISTINCT burn_date) AS burn_days,
               EXTRACT(DAY FROM (DATE_TRUNC('month', burn_date::date) + INTERVAL '1 month - 1 day'))::int AS days_in_month
        FROM burns
        WHERE wallet_address = ${wallet}
          AND status = 'VERIFIED'
          AND DATE_TRUNC('month', burn_date::date) < DATE_TRUNC('month', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
        GROUP BY DATE_TRUNC('month', burn_date::date)
      )
      SELECT COUNT(*)::int AS perfect_months FROM monthly WHERE burn_days = days_in_month
    `);

    // Try cached ranks first
    const rankCacheKey = `profile:rank:${wallet}`;
    let cachedRanks: { streak: number; lifetime: number; badges: number } | null = null;
    try {
      const cached = await redis.get(rankCacheKey);
      if (cached) cachedRanks = JSON.parse(cached);
    } catch { /* Redis down */ }

    const ranksPromise = cachedRanks
      ? Promise.resolve(cachedRanks)
      : (async () => {
          const [streakRankResult, lifetimeRankResult, badgeRankResult] = await Promise.all([
            db.execute(sql`SELECT COUNT(*) + 1 as rank FROM users WHERE current_streak > ${user.currentStreak}`),
            db.execute(sql`SELECT COUNT(*) + 1 as rank FROM users WHERE lifetime_burned > ${user.lifetimeBurned}`),
            db.execute(sql`SELECT COUNT(*) + 1 as rank FROM users WHERE badge_count > ${user.badgeCount}`),
          ]);
          const ranks = {
            streak: Number((streakRankResult[0] as unknown as RankRow)?.rank ?? 0),
            lifetime: Number((lifetimeRankResult[0] as unknown as RankRow)?.rank ?? 0),
            badges: Number((badgeRankResult[0] as unknown as RankRow)?.rank ?? 0),
          };
          try { await redis.setex(rankCacheKey, 60, JSON.stringify(ranks)); } catch { /* Redis down */ }
          return ranks;
        })();

    const [userBadges, todayBurnResult, ranks, weeklyBurnResult, dailyBurnResult, totalBurnCountResult, perfectMonthsResult, referralStatsResult] = await Promise.all([
      badgesPromise, todayBurnPromise, ranksPromise, weeklyBurnPromise, dailyBurnPromise, totalBurnCountPromise, perfectMonthsPromise, referralStatsPromise,
    ]);
    const todayBurn = todayBurnResult[0];
    const weeklyRow = weeklyBurnResult[0] as { weekly_burn_skr: string; weekly_burn_days: number } | undefined;
    const dailyRow = dailyBurnResult[0] as { daily_burn_skr: string; daily_burn_count: number } | undefined;
    const totalRow = totalBurnCountResult[0] as { total_burn_count: number } | undefined;
    const perfectRow = perfectMonthsResult[0] as { perfect_months: number } | undefined;
    const referralRow = referralStatsResult[0] as { invited: number; qualified: number; pending: number } | undefined;

    const totalXp = Number(user.xp ?? 0);
    const levelInfo = xpToNextLevel(totalXp);

    return reply.code(200).send({
      walletAddress: user.walletAddress,
      currentStreak: effectiveStreak,
      longestStreak: user.longestStreak,
      streakBroken,
      previousStreak,
      lifetimeBurned: user.lifetimeBurned,
      totalDeposited: user.totalDeposited,
      streakShieldActive: user.streakShieldActive,
      streakShields: user.streakShields ?? 0,
      xp: totalXp,
      level: levelInfo.currentLevel,
      levelTitle: getLevelTitle(levelInfo.currentLevel),
      xpIntoLevel: levelInfo.xpIntoLevel,
      xpToNextLevel: levelInfo.xpNeeded,
      todayBurned: !!todayBurn,
      todayBurnSignature: todayBurn?.signature ?? null,
      lastBurnAt: user.lastBurnAt?.toISOString() ?? null,
      weeklyBurnSKR: weeklyRow?.weekly_burn_skr ?? '0',
      weeklyBurnDays: weeklyRow?.weekly_burn_days ?? 0,
      dailyBurnSKR: dailyRow?.daily_burn_skr ?? '0',
      dailyBurnCount: dailyRow?.daily_burn_count ?? 0,
      totalBurnCount: totalRow?.total_burn_count ?? 0,
      perfectMonths: perfectRow?.perfect_months ?? 0,
      referral: {
        code: user.referralCode,
        referredByUserId: user.referredByUserId,
        invited: referralRow?.invited ?? 0,
        qualified: referralRow?.qualified ?? 0,
        pending: referralRow?.pending ?? 0,
      },
      badges: userBadges.map((b: typeof userBadges[number]) => {
        const def = BADGE_DEFINITIONS.find(d => d.id === b.badgeId);
        return {
          id: b.badgeId,
          name: def?.name ?? b.badgeId,
          description: def?.description ?? '',
          emoji: def?.emoji ?? '🔥',
          type: def?.type ?? 'streak',
          earnedAt: b.earnedAt.toISOString(),
          nftMintAddress: b.nftMintAddress,
          nftMintStatus: b.nftMintStatus,
        };
      }),
      rank: {
        streak: ranks.streak,
        lifetime: ranks.lifetime,
        badges: ranks.badges,
      },
      joinedAt: user.createdAt.toISOString(),
    });
  });
}
