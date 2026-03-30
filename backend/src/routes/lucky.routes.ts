import { FastifyInstance } from 'fastify';
import { getUserInventory, getUserBuffs, getRecentDrops, getItemCatalog } from '../services/lucky.service.js';

export async function luckyRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/lucky/inventory — user's consumable items
  fastify.get('/api/v1/lucky/inventory', async (request, reply) => {
    const wallet = request.user.sub;
    const userId = await resolveUserId(wallet);
    if (!userId) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const [inventory, buffs] = await Promise.all([
      getUserInventory(userId),
      getUserBuffs(userId),
    ]);

    return reply.code(200).send({ inventory, activeBuffs: buffs });
  });

  // GET /api/v1/lucky/history — recent drops
  fastify.get('/api/v1/lucky/history', async (request, reply) => {
    const wallet = request.user.sub;
    const userId = await resolveUserId(wallet);
    if (!userId) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const drops = await getRecentDrops(userId);
    return reply.code(200).send({ drops });
  });

  // GET /api/v1/lucky/catalog — all possible items
  fastify.get('/api/v1/lucky/catalog', async (request, reply) => {
    const catalog = getItemCatalog();
    return reply.code(200).send({ items: catalog });
  });
}

// Helper to resolve wallet → user id
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

async function resolveUserId(wallet: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.walletAddress, wallet))
    .limit(1);
  return user?.id ?? null;
}
