/**
 * Challenge routes — daily & weekly challenge state + leaderboard.
 */
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { todayUTC } from '../lib/solana.js';
import { getChallengeState } from '../services/challenges.service.js';
import { xpToNextLevel, getLevelTitle } from '../services/xp.service.js';

export async function challengeRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/challenges — current daily + weekly challenge state
  fastify.get('/api/v1/challenges', async (request, reply) => {
    const wallet = request.user.sub;

    const [user] = await db
      .select({ id: users.id, xp: users.xp, level: users.level })
      .from(users)
      .where(eq(users.walletAddress, wallet))
      .limit(1);

    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const today = todayUTC();
    const state = await getChallengeState(user.id, wallet, today);

    const totalXp = Number(user.xp);
    const levelInfo = xpToNextLevel(totalXp);

    return reply.code(200).send({
      xp: totalXp,
      level: levelInfo.currentLevel,
      levelTitle: getLevelTitle(levelInfo.currentLevel),
      xpIntoLevel: levelInfo.xpIntoLevel,
      xpToNextLevel: levelInfo.xpNeeded,
      dailyChallenges: state.daily,
      weeklyChallenges: state.weekly,
      dailySweep: state.dailySweep,
      weekStart: state.weekStart,
    });
  });
}
