import { FastifyInstance } from 'fastify';
import { desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { redis } from '../lib/redis.js';

/** Type for rows selected from the users table in leaderboard queries. */
interface UserRow {
  walletAddress: string;
  currentStreak: number;
  longestStreak: number;
  lifetimeBurned: string;
  badgeCount: number;
  xp: number;
}

/** Type for raw SQL rank queries. */
interface RankRow { rank: string; value: string }

/** Type for raw SQL aggregate stats. */
interface StatsRow extends Record<string, unknown> {
  [key: string]: unknown;
}

/**
 * Safe column mapping — prevents SQL injection by avoiding sql.raw() with user input.
 */
const LEADERBOARD_CONFIG = {
  streak: {
    orderColumn: users.longestStreak,
    displaySuffix: ' days',
    extractValue: (r: UserRow): number => r.longestStreak,
    rankQuery: (wallet: string) => sql`
      SELECT COUNT(*) + 1 as rank, u.longest_streak as value
      FROM users u
      WHERE u.longest_streak > COALESCE((
        SELECT longest_streak FROM users WHERE wallet_address = ${wallet}
      ), 0)`,
  },
  lifetime: {
    orderColumn: users.lifetimeBurned,
    displaySuffix: ' SKR',
    extractValue: (r: UserRow): number => parseFloat(r.lifetimeBurned ?? '0'),
    rankQuery: (wallet: string) => sql`
      SELECT COUNT(*) + 1 as rank, u.lifetime_burned as value
      FROM users u
      WHERE CAST(u.lifetime_burned AS NUMERIC) > COALESCE(CAST((
        SELECT lifetime_burned FROM users WHERE wallet_address = ${wallet}
      ) AS NUMERIC), 0)`,
  },
  badges: {
    orderColumn: users.badgeCount,
    displaySuffix: ' badges',
    extractValue: (r: UserRow): number => r.badgeCount,
    rankQuery: (wallet: string) => sql`
      SELECT COUNT(*) + 1 as rank, u.badge_count as value
      FROM users u
      WHERE u.badge_count > (
        SELECT badge_count FROM users WHERE wallet_address = ${wallet}
      )`,
  },
  referrals: {
    orderColumn: users.referralQualifiedCount,
    displaySuffix: ' qualified',
    extractValue: (r: UserRow & { referralQualifiedCount?: number }): number => r.referralQualifiedCount ?? 0,
    rankQuery: (wallet: string) => sql`
      SELECT COUNT(*) + 1 as rank, u.referral_qualified_count as value
      FROM users u
      WHERE u.referral_qualified_count > (
        SELECT referral_qualified_count FROM users WHERE wallet_address = ${wallet}
      )`,
  },
  xp: {
    orderColumn: users.xp,
    displaySuffix: ' XP',
    extractValue: (r: UserRow): number => Number(r.xp ?? 0),
    rankQuery: (wallet: string) => sql`
      SELECT COUNT(*) + 1 as rank, u.xp as value
      FROM users u
      WHERE u.xp > (
        SELECT xp FROM users WHERE wallet_address = ${wallet}
      )`,
  },
} as const;

type LeaderboardType = keyof typeof LEADERBOARD_CONFIG;

/** In-process fallback cache for global stats when Redis is down. */
let _inProcessStatsCache: { data: unknown; expiresAt: number } | null = null;
let _inProcessComputing = false;

export async function leaderboardRoutes(fastify: FastifyInstance) {

  // GET /api/v1/leaderboard/:type (authenticated)
  fastify.get('/api/v1/leaderboard/:type', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const wallet = request.user.sub;
    const { type } = request.params as { type: string };
    const { page = '1', limit = '50' } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;

    if (!(type in LEADERBOARD_CONFIG)) {
      return reply.code(400).send({ error: 'INVALID_LEADERBOARD_TYPE' });
    }

    const config = LEADERBOARD_CONFIG[type as LeaderboardType];

    const rankings = await db
      .select({
        walletAddress: users.walletAddress,
        currentStreak: users.currentStreak,
        longestStreak: users.longestStreak,
        lifetimeBurned: users.lifetimeBurned,
        badgeCount: users.badgeCount,
        referralQualifiedCount: users.referralQualifiedCount,
        xp: users.xp,
        profileTitle: users.profileTitle,
      })
      .from(users)
      .orderBy(desc(config.orderColumn))
      .limit(limitNum)
      .offset(offset);

    const rankedResults = rankings.map((r, idx) => {
      const value = config.extractValue(r);
      return {
        rank: offset + idx + 1,
        walletAddress: r.walletAddress,
        value,
        displayValue: `${value}${config.displaySuffix}`,
        profileTitle: r.profileTitle ?? null,
      };
    });

    // Find user's rank — check in current page first
    let userRank = rankedResults.find(r => r.walletAddress === wallet);
    if (!userRank) {
      // User not in current page — compute rank with parameterized query (no sql.raw)
      // First verify user exists to avoid returning rank #1 for unknown wallets
      const [existsRow] = await db
        .select({ walletAddress: users.walletAddress })
        .from(users)
        .where(sql`wallet_address = ${wallet}`)
        .limit(1);
      if (existsRow) {
        const [countResult] = await db.execute(config.rankQuery(wallet));
        const row = countResult as unknown as RankRow;
        const rank = Number(row?.rank ?? 0);
        const value = Number(row?.value ?? 0);
        if (rank > 0) {
          const [userRow] = await db
            .select({ profileTitle: users.profileTitle })
            .from(users)
            .where(sql`wallet_address = ${wallet}`)
            .limit(1);
          userRank = {
            rank,
            walletAddress: wallet,
            value,
            displayValue: `${value}${config.displaySuffix}`,
            profileTitle: userRow?.profileTitle ?? null,
          };
        }
      }
    }

    // Count total users for pagination (cached)
    const [totalRow] = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
    const totalUsers = (totalRow as unknown as { count: number })?.count ?? 0;

    return reply.code(200).send({
      rankings: rankedResults,
      userRank: userRank ?? null,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalUsers,
        hasMore: rankedResults.length === limitNum,
      },
    });
  });

  // GET /api/v1/leaderboard/global/stats (PUBLIC — no auth required)
  // Global burn statistics for the entire program
  fastify.get('/api/v1/leaderboard/global/stats', async (request, reply) => {
    // Try cache first (60 second TTL for public endpoint)
    try {
      const cached = await redis.get('global:stats');
      if (cached) {
        return reply.code(200).send(JSON.parse(cached));
      }
    } catch { /* Redis down — skip cache */ }

    // Stampede protection: only one instance refreshes the cache at a time.
    // Others wait briefly for the result, then fall through to compute if needed.
    let lockAcquired = false;
    try {
      lockAcquired = (await redis.set('global:stats:lock', '1', 'EX', 10, 'NX')) === 'OK';
    } catch { /* Redis down */ }

    if (!lockAcquired) {
      // Another instance is computing — wait briefly for the cached result
      await new Promise(r => setTimeout(r, 500));
      try {
        const cached = await redis.get('global:stats');
        if (cached) return reply.code(200).send(JSON.parse(cached));
      } catch { /* fall through to compute */ }
      // In-process fallback: if Redis is completely down, return stale cache to prevent stampede
      if (_inProcessStatsCache && _inProcessStatsCache.expiresAt > Date.now()) {
        return reply.code(200).send(_inProcessStatsCache.data);
      }
      if (_inProcessComputing) {
        // Another request is already computing — return 503 instead of stampeding DB
        return reply.code(503).send({ error: 'STATS_COMPUTING', message: 'Please retry shortly.' });
      }
    }

    _inProcessComputing = true;

    try {
    // Parallel fetch all independent aggregation queries
    const burnStatsP = db.execute(sql`SELECT
      COALESCE(SUM(burn_amount), 0) as total_burned,
      COUNT(*) as total_burns,
      COUNT(DISTINCT wallet_address) as unique_burners
    FROM burns WHERE status = 'VERIFIED'`);
    const depositStatsP = db.execute(sql`SELECT COALESCE(SUM(amount), 0) as total_deposited, COUNT(*) as total_deposits
    FROM deposits WHERE status = 'VERIFIED'`);
    const memberStatsP = db.execute(sql`SELECT COUNT(*) as total_members FROM users`);
    const todayStatsP = db.execute(sql`SELECT
      COUNT(*) as burns_today,
      COALESCE(SUM(burn_amount), 0) as burned_today_amount,
      COUNT(DISTINCT wallet_address) as unique_burners_today
    FROM burns WHERE status = 'VERIFIED' AND burn_date = CURRENT_DATE`);
    const streakStatsP = db.execute(sql`SELECT
      MAX(current_streak) as highest_active_streak,
      MAX(longest_streak) as highest_ever_streak,
      ROUND(AVG(current_streak) FILTER (WHERE current_streak > 0), 1) as avg_active_streak
    FROM users`);
    const badgeStatsP = db.execute(sql`SELECT COUNT(*) as total_badges_earned FROM badges`);
    const topBurnersP = db.select({
      walletAddress: users.walletAddress,
      lifetimeBurned: users.lifetimeBurned,
      currentStreak: users.currentStreak,
      badgeCount: users.badgeCount,
    }).from(users).orderBy(desc(users.lifetimeBurned)).limit(3);

    const [burnStatsR, depositStatsR, memberStatsR, todayStatsR, streakStatsR, badgeStatsR, topBurners] =
      await Promise.all([burnStatsP, depositStatsP, memberStatsP, todayStatsP, streakStatsP, badgeStatsP, topBurnersP]);

    const burnStats = burnStatsR[0] as unknown as StatsRow;
    const depositStats = depositStatsR[0] as unknown as StatsRow;
    const memberStats = memberStatsR[0] as unknown as StatsRow;
    const todayStats = todayStatsR[0] as unknown as StatsRow;
    const streakStats = streakStatsR[0] as unknown as StatsRow;
    const badgeStats = badgeStatsR[0] as unknown as StatsRow;

    const stats = {
      totalSkrBurned: String(burnStats?.total_burned ?? '0'),
      totalBurnTransactions: Number(burnStats?.total_burns ?? 0),
      uniqueBurners: Number(burnStats?.unique_burners ?? 0),
      totalSkrDeposited: String(depositStats?.total_deposited ?? '0'),
      totalDepositTransactions: Number(depositStats?.total_deposits ?? 0),
      totalMembers: Number(memberStats?.total_members ?? 0),
      burnsToday: Number(todayStats?.burns_today ?? 0),
      burnedTodayAmount: String(todayStats?.burned_today_amount ?? '0'),
      uniqueBurnersToday: Number(todayStats?.unique_burners_today ?? 0),
      highestActiveStreak: Number(streakStats?.highest_active_streak ?? 0),
      highestEverStreak: Number(streakStats?.highest_ever_streak ?? 0),
      avgActiveStreak: Number(streakStats?.avg_active_streak ?? 0),
      totalBadgesEarned: Number(badgeStats?.total_badges_earned ?? 0),
      topBurners: topBurners.map((b: typeof topBurners[number], idx: number) => ({
        rank: idx + 1,
        walletAddress: b.walletAddress,
        lifetimeBurned: b.lifetimeBurned,
        currentStreak: b.currentStreak,
        badgeCount: b.badgeCount,
      })),
      lastUpdated: new Date().toISOString(),
    };

    // Cache for 60 seconds
    try { await redis.setex('global:stats', 60, JSON.stringify(stats)); } catch { /* Redis down — skip cache */ }
    _inProcessStatsCache = { data: stats, expiresAt: Date.now() + 60_000 };
    _inProcessComputing = false;

    return reply.code(200).send(stats);
    } catch (err) {
      _inProcessComputing = false;
      throw err;
    }
  });
}
