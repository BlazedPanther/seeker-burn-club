import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

import { connection, TREASURY_SKR_ATA } from '../lib/solana.js';
import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';

/** Raw SQL aggregate result row. */
interface StatsRow extends Record<string, unknown> {
  [key: string]: unknown;
}

export async function treasuryRoutes(fastify: FastifyInstance) {

  // GET /api/v1/treasury/stats — PUBLIC (no auth required for transparency)
  fastify.get('/api/v1/treasury/stats', async (request, reply) => {
    // Try cache first
    try {
      const cached = await redis.get('treasury:stats');
      if (cached) {
        return reply.code(200).send(JSON.parse(cached));
      }
    } catch { /* Redis down — skip cache */ }

    // Fetch on-chain balance
    let vaultBalance = '0';
    let ataVerified = false;
    try {
      const balanceResp = await connection.getTokenAccountBalance(TREASURY_SKR_ATA);
      vaultBalance = balanceResp.value.uiAmountString ?? '0';
      ataVerified = true;
    } catch {
      ataVerified = false;
    }

    // Aggregate DB stats in parallel
    const [burnStatsR, depositStatsR, memberStatsR, todayStatsR] = await Promise.all([
      db.execute(sql`SELECT COALESCE(SUM(burn_amount), 0) as total_burned, COUNT(*) as total_burns FROM burns WHERE status = 'VERIFIED'`),
      db.execute(sql`SELECT COALESCE(SUM(amount), 0) as total_deposited FROM deposits WHERE status = 'VERIFIED'`),
      db.execute(sql`SELECT COUNT(*) as total_members FROM users`),
      db.execute(sql`SELECT COUNT(*) as burns_today FROM burns WHERE status = 'VERIFIED' AND burn_date = CURRENT_DATE`),
    ]);
    const burnStats = burnStatsR[0] as unknown as StatsRow;
    const depositStats = depositStatsR[0] as unknown as StatsRow;
    const memberStats = memberStatsR[0] as unknown as StatsRow;
    const todayStats = todayStatsR[0] as unknown as StatsRow;

    const stats = {
      vaultBalance,
      totalBurnedAllUsers: String(burnStats?.total_burned ?? '0'),
      totalDeposited: String(depositStats?.total_deposited ?? '0'),
      totalMembers: Number(memberStats?.total_members ?? 0),
      burnsToday: Number(todayStats?.burns_today ?? 0),
      treasuryATA: env.TREASURY_SKR_ATA,
      treasuryATAVerified: ataVerified,
      lastUpdated: new Date().toISOString(),
    };

    // Cache for 5 minutes
    try { await redis.setex('treasury:stats', 300, JSON.stringify(stats)); } catch { /* Redis down — skip cache */ }

    return reply.code(200).send(stats);
  });
}
