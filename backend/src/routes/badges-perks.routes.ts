import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { eq, and, sql, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { badges, perks, perkClaims, users } from '../db/schema.js';
import { BADGE_DEFINITIONS, getBadgeById } from '../lib/badges.js';
import { generateBadgeSvg, generateBadgeMetadata } from '../lib/badge-assets.js';
import { buildBadgeClaimTransaction, verifyCollectionMembership, checkDeterministicMintExists } from '../lib/nft.js';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';
import { MAX_SHIELDS } from '../services/shop.service.js';
import { PublicKey } from '@solana/web3.js';
import { creatureSeed, generateCreatureGif, generateCreaturePng, generateCreatureMetadata, resolveTraits } from '../lib/creature.js';

export async function badgeAssetRoutes(fastify: FastifyInstance) {
  // Public showcase seeds used in onboarding/teaser UI. Real wallets are locked
  // until the badge NFT is actually minted to prevent artwork spoilers.
  const isShowcaseWallet = (wallet: string): boolean =>
    wallet.startsWith('SBCSpirit_') || wallet === 'BurnSpiritsCollection';

  const getMintedCreatureAccess = async (
    wallet: string,
    badgeId: string,
  ): Promise<{ allowed: boolean; seedSalt?: string }> => {
    if (isShowcaseWallet(wallet)) return { allowed: true };
    const [minted] = await db
      .select({ id: badges.id, nftSeedSalt: badges.nftSeedSalt })
      .from(badges)
      .where(and(
        eq(badges.walletAddress, wallet),
        eq(badges.badgeId, badgeId),
        isNotNull(badges.nftMintAddress),
      ))
      .limit(1);
    if (!minted) return { allowed: false };
    return { allowed: true, seedSalt: minted.nftSeedSalt ?? undefined };
  };

  // GET /api/v1/collection/metadata.json -- Collection-level Metaplex metadata
  fastify.get('/api/v1/collection/metadata.json', async (request, reply) => {
    const baseUrl = request.protocol + '://' + request.hostname;
    reply.header('Content-Type', 'application/json');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.code(200).send({
      name: 'Burn Spirits',
      symbol: 'BURNSPIRIT',
      description: 'Unique animated pixel creatures earned by reaching milestones in Seeker Burn Club. Each spirit is deterministically generated from your wallet - no two are alike.',
      image: `${baseUrl}/api/v1/collection/cover.gif`,
      external_url: 'https://seekerburnclub.xyz',
      properties: {
        files: [{ uri: `${baseUrl}/api/v1/collection/cover.gif`, type: 'image/gif' }],
        category: 'image',
      },
    });
  });

  // GET /api/v1/collection/cover.gif -- Collection cover image (creature #0)
  fastify.get('/api/v1/collection/cover.gif', async (_request, reply) => {
    const { generateCreatureGif, creatureSeed } = await import('../lib/creature.js');
    const seed = creatureSeed('BurnSpiritsCollection', 'COVER');
    const { gif } = generateCreatureGif(seed);
    reply.header('Content-Type', 'image/gif');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.code(200).send(gif);
  });

  // GET /api/v1/badges/metadata/:id -- NFT metadata JSON (Metaplex-compatible)
  fastify.get<{ Params: { id: string } }>('/api/v1/badges/metadata/:id', async (request, reply) => {
    const { id } = request.params;
    const def = getBadgeById(id.replace(/\.json$/, ''));
    if (!def) return reply.code(404).send({ error: 'BADGE_NOT_FOUND' });

    reply.header('Content-Type', 'application/json');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.code(200).send(generateBadgeMetadata(def.id));
  });

  // GET /api/v1/badges/image/:id -- SVG badge image
  fastify.get<{ Params: { id: string } }>('/api/v1/badges/image/:id', async (request, reply) => {
    const rawId = request.params.id.replace(/\.(svg|png)$/, '');
    const def = getBadgeById(rawId);
    if (!def) return reply.code(404).send({ error: 'BADGE_NOT_FOUND' });

    const svg = generateBadgeSvg(def.id);
    reply.header('Content-Type', 'image/svg+xml');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.code(200).send(svg);
  });

  // GET /api/v1/badges/all -- All badge definitions (public catalog)
  fastify.get('/api/v1/badges/all', async (_request, reply) => {
    return reply.code(200).send(
      BADGE_DEFINITIONS.map(def => ({
        id: def.id,
        name: def.name,
        description: def.description,
        emoji: def.emoji,
        type: def.type,
        threshold: def.threshold,
        imageUrl: `/api/v1/badges/image/${def.id}`,
        metadataUrl: `/api/v1/badges/metadata/${def.id}`,
      }))
    );
  });

  // â”€â”€ Creature NFT Routes (public, deterministic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // GET /api/v1/creatures/image/:wallet/:badgeId.gif -- Animated creature GIF
  fastify.get<{ Params: { wallet: string; badgeId: string }; Querystring: { transparent?: string } }>(
    '/api/v1/creatures/image/:wallet/:badgeId',
    async (request, reply) => {
      const wallet = request.params.wallet;
      const badgeId = request.params.badgeId.replace(/\.gif$/, '');
      const def = getBadgeById(badgeId);
      if (!def) return reply.code(404).send({ error: 'BADGE_NOT_FOUND' });
      const access = await getMintedCreatureAccess(wallet, badgeId);
      if (!access.allowed) {
        return reply.code(404).send({ error: 'CREATURE_LOCKED_UNTIL_MINT' });
      }
      const wantTransparent = request.query.transparent === '1';

      // Redis cache: GIF is deterministic so we cache indefinitely (TTL 30 days).
      // Key is safe: wallet+badgeId are URL path segments (no colons or spaces).
      const cacheKey = `creature:gif:${wallet}:${badgeId}${wantTransparent ? ':t' : ''}`;
      try {
        const cached = await redis.getBuffer(cacheKey);
        if (cached) {
          reply.header('Content-Type', 'image/gif');
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
          reply.header('X-Cache', 'HIT');
          return reply.code(200).send(cached);
        }
      } catch { /* Redis down -- fall through to generation */ }

      const seed = creatureSeed(wallet, badgeId, access.seedSalt);
      const { gif } = generateCreatureGif(seed, badgeId, { transparent: wantTransparent });

      // Store in Redis (fire-and-forget; TTL 30 days)
      try { await redis.setex(cacheKey, 60 * 60 * 24 * 365, Buffer.from(gif)); } catch { /* Redis down */ }

      reply.header('Content-Type', 'image/gif');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('X-Cache', 'MISS');
      return reply.code(200).send(gif);
    },
  );

  // GET /api/v1/creatures/image/:wallet/:badgeId.png -- Transparent RGBA PNG (game sprite)
  fastify.get<{ Params: { wallet: string; badgeId: string } }>(
    '/api/v1/creatures/image/:wallet/:badgeId.png',
    async (request, reply) => {
      const wallet = request.params.wallet;
      const badgeId = request.params.badgeId.replace(/\.png$/, '');
      const def = getBadgeById(badgeId);
      if (!def) return reply.code(404).send({ error: 'BADGE_NOT_FOUND' });
      const access = await getMintedCreatureAccess(wallet, badgeId);
      if (!access.allowed) {
        return reply.code(404).send({ error: 'CREATURE_LOCKED_UNTIL_MINT' });
      }

      const cacheKey = `creature:png:${wallet}:${badgeId}`;
      try {
        const cached = await redis.getBuffer(cacheKey);
        if (cached) {
          reply.header('Content-Type', 'image/png');
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
          reply.header('X-Cache', 'HIT');
          return reply.code(200).send(cached);
        }
      } catch { /* Redis down -- fall through to generation */ }

      const seed = creatureSeed(wallet, badgeId, access.seedSalt);
      const { png } = generateCreaturePng(seed, badgeId);

      try { await redis.setex(cacheKey, 60 * 60 * 24 * 365, Buffer.from(png)); } catch { /* Redis down */ }

      reply.header('Content-Type', 'image/png');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('X-Cache', 'MISS');
      return reply.code(200).send(png);
    },
  );

  // GET /api/v1/creatures/metadata/:wallet/:badgeId.json -- Metaplex-compatible metadata
  fastify.get<{ Params: { wallet: string; badgeId: string } }>(
    '/api/v1/creatures/metadata/:wallet/:badgeId',
    async (request, reply) => {
      const wallet = request.params.wallet;
      const badgeId = request.params.badgeId.replace(/\.json$/, '');
      const def = getBadgeById(badgeId);
      if (!def) return reply.code(404).send({ error: 'BADGE_NOT_FOUND' });
      const access = await getMintedCreatureAccess(wallet, badgeId);
      if (!access.allowed) {
        return reply.code(404).send({ error: 'CREATURE_LOCKED_UNTIL_MINT' });
      }

      const baseUrl = request.protocol + '://' + request.hostname;
      const metadata = generateCreatureMetadata(wallet, badgeId, def.name, baseUrl, access.seedSalt);

      reply.header('Content-Type', 'application/json');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.code(200).send(metadata);
    },
  );

  // GET /api/v1/creatures/preview/:wallet/:badgeId -- Quick trait preview (no GIF render)
  fastify.get<{ Params: { wallet: string; badgeId: string } }>(
    '/api/v1/creatures/preview/:wallet/:badgeId',
    async (request, reply) => {
      const wallet = request.params.wallet;
      const badgeId = request.params.badgeId;
      const def = getBadgeById(badgeId);
      if (!def) return reply.code(404).send({ error: 'BADGE_NOT_FOUND' });
      const access = await getMintedCreatureAccess(wallet, badgeId);
      if (!access.allowed) {
        return reply.code(404).send({ error: 'CREATURE_LOCKED_UNTIL_MINT' });
      }

      const seed = creatureSeed(wallet, badgeId, access.seedSalt);
      const traits = resolveTraits(seed, badgeId);
      return reply.code(200).send({
        badgeId, badgeName: def.name,
        creatureTraits: traits,
        imageUrl: `/api/v1/creatures/image/${wallet}/${badgeId}.gif`,
        metadataUrl: `/api/v1/creatures/metadata/${wallet}/${badgeId}.json`,
      });
    },
  );
}

export async function badgesRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/badges
  fastify.get('/api/v1/badges', async (request, reply) => {
    const wallet = request.user.sub;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.walletAddress, wallet))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    }

    const earned = await db
      .select()
      .from(badges)
      .where(eq(badges.userId, user.id));

    return reply.code(200).send(
      earned.map(b => {
        const def = BADGE_DEFINITIONS.find(d => d.id === b.badgeId);
        return {
          id: b.badgeId,
          name: def?.name ?? b.badgeId,
          description: def?.description ?? '',
          emoji: def?.emoji ?? 'ðŸ”¥',
          type: def?.type ?? 'streak',
          earnedAt: b.earnedAt.toISOString(),
          nftMintAddress: b.nftMintAddress,
          nftMintStatus: b.nftMintStatus,
          nftTxSignature: b.nftTxSignature,
        };
      })
    );
  });

  // â”€â”€ NFT self-mint claim flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * POST /api/v1/badges/:badgeId/claim/prepare
   * Builds a partially-signed NFT mint transaction where the USER is fee payer.
   * The server (mint authority) adds its signatures; the client adds the wallet signature.
   */
  fastify.post<{ Params: { badgeId: string } }>(
    '/api/v1/badges/:badgeId/claim/prepare',
    async (request, reply) => {
      const wallet = request.user.sub;
      const { badgeId } = request.params;

      // â”€â”€ Mint pause check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (!env.MINTING_ENABLED) {
        return reply.code(503).send({
          error: 'MINTING_PAUSED',
          message: 'NFT minting is currently paused. Please try again later.',
        });
      }

      // Rate limit: max 10 claim prepares per hour per wallet
      // (prepare is now a cheap SOL-transfer build — no keypair gen or partial signing)
      try {
        const rateKey = `ratelimit:claim-prepare:v2:${wallet}`;
        const count = await redis.eval(
          `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], 3600) end; return c`,
          1,
          rateKey,
        ) as number;
        if (count > 10) {
          return reply.code(429).send({ error: 'RATE_LIMIT_EXCEEDED', message: 'Max 10 claim prepares per hour.' });
        }
      } catch { /* Redis down -- allow */ }

      // Verify the badge exists in the catalog
      const def = getBadgeById(badgeId);
      if (!def) return reply.code(404).send({ error: 'BADGE_NOT_FOUND' });

      // Verify the user has earned this badge and hasn't claimed the NFT yet
      const [badge] = await db
        .select()
        .from(badges)
        .where(and(eq(badges.walletAddress, wallet), eq(badges.badgeId, badgeId)))
        .limit(1);

      if (!badge) return reply.code(404).send({ error: 'BADGE_NOT_EARNED' });
      if (badge.nftMintStatus === 'COMPLETED' && badge.nftMintAddress) {
        return reply.code(409).send({ error: 'NFT_ALREADY_MINTED', nftMintAddress: badge.nftMintAddress });
      }
      // Block if currently minting — prevents MINTING → PENDING_CLAIM state regression
      // which would allow a double-payment race (F2).
      if (badge.nftMintStatus === 'MINTING') {
        return reply.code(409).send({
          error: 'MINTING_IN_PROGRESS',
          message: 'NFT is currently being minted. Please check /claim/status for updates.',
        });
      }

      const seedSalt = badge.nftSeedSalt ?? crypto.randomBytes(16).toString('hex');
      const claimTx = await buildBadgeClaimTransaction(wallet, badgeId, seedSalt);

      // Store the expected mint so confirm can verify it
      await db
        .update(badges)
        .set({
          pendingClaimMint: claimTx.mintPublicKey,
          pendingClaimExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min TTL
          nftMintStatus: 'PENDING_CLAIM',
          nftSeedSalt: seedSalt,
        })
        .where(and(eq(badges.walletAddress, wallet), eq(badges.badgeId, badgeId)));

      return reply.code(200).send(claimTx);
    },
  );

  /**
   * POST /api/v1/badges/:badgeId/claim/confirm
   * Called after the user signs + sends the full mint transaction via MWA.
   * Checks on-chain for the NFT mint; returns COMPLETED or MINTING (poll status).
   */
  fastify.post<{
    Params: { badgeId: string };
    Body: { txSignature: string; mintPublicKey?: string };
  }>(
    '/api/v1/badges/:badgeId/claim/confirm',
    async (request, reply) => {
      const wallet = request.user.sub;
      const { badgeId } = request.params;
      const confirmSchema = z.object({
        txSignature: z.string().min(64).max(88),
        mintPublicKey: z.string().max(64).optional(),
      });
      const { txSignature } = confirmSchema.parse(request.body);

      const [badge] = await db
        .select()
        .from(badges)
        .where(and(eq(badges.walletAddress, wallet), eq(badges.badgeId, badgeId)))
        .limit(1);

      if (!badge) return reply.code(404).send({ error: 'BADGE_NOT_EARNED' });
      if (badge.nftMintStatus === 'COMPLETED') {
        return reply.code(200).send({ success: true, nftMintAddress: badge.nftMintAddress });
      }
      if (badge.nftMintStatus === 'MINTING') {
        return reply.code(200).send({ success: true, status: 'MINTING' });
      }

      // Verify a claim was prepared
      if (!badge.pendingClaimMint && badge.nftMintStatus !== 'MINT_FAILED') {
        return reply.code(400).send({ error: 'NO_PENDING_CLAIM', message: 'Call /claim/prepare first.' });
      }

      // Rate-limit confirm calls (50/hr per wallet)
      try {
        const confirmRateKey = `ratelimit:claim-confirm:v2:${wallet}`;
        const confirmCount = await redis.eval(
          `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], 3600) end; return c`,
          1,
          confirmRateKey,
        ) as number;
        if (confirmCount > 50) {
          return reply.code(429).send({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many confirm attempts. Try again later.' });
        }
      } catch { /* Redis down — allow through */ }

      // Atomic state transition: only one concurrent request can claim this
      const [transitioned] = await db.execute(sql`
        UPDATE badges
        SET nft_tx_signature = ${txSignature},
            nft_mint_status = 'MINTING',
            nft_mint_started_at = NOW(),
            nft_mint_failure_reason = NULL
        WHERE wallet_address = ${wallet}
          AND badge_id = ${badgeId}
          AND nft_mint_status IN ('PENDING_CLAIM', 'MINT_FAILED')
        RETURNING id
      `) as unknown as { id: number }[];
      if (!transitioned) {
        const [current] = await db.select({ s: badges.nftMintStatus, m: badges.nftMintAddress })
          .from(badges).where(and(eq(badges.walletAddress, wallet), eq(badges.badgeId, badgeId))).limit(1);
        if (current?.s === 'COMPLETED') return reply.code(200).send({ success: true, nftMintAddress: current.m });
        return reply.code(200).send({ success: true, status: current?.s ?? 'MINTING' });
      }

      // Immediate on-chain check — tx may already be confirmed by this point
      const seedSalt = badge.nftSeedSalt ?? undefined;
      const existingMint = await checkDeterministicMintExists(wallet, badgeId, seedSalt);
      if (existingMint) {
        await db.execute(sql`
          UPDATE badges
          SET nft_mint_address = ${existingMint},
              nft_mint_status = 'COMPLETED',
              pending_claim_mint = NULL,
              pending_claim_expires_at = NULL
          WHERE wallet_address = ${wallet}
            AND badge_id = ${badgeId}
        `);

        // Fire-and-forget: collection verify + image cache warm
        void verifyCollectionMembership(existingMint).catch(() => {});
        void (async () => {
          try {
            const seed = creatureSeed(wallet, badgeId, seedSalt);
            const [{ gif }, { png }] = await Promise.all([
              import('../lib/creature.js').then(m => m.generateCreatureGif(seed, badgeId)),
              import('../lib/creature.js').then(m => m.generateCreaturePng(seed, badgeId)),
            ]);
            await Promise.all([
              redis.setex(`creature:gif:${wallet}:${badgeId}`, 60 * 60 * 24 * 365, Buffer.from(gif)),
              redis.setex(`creature:png:${wallet}:${badgeId}`, 60 * 60 * 24 * 365, Buffer.from(png)),
            ]);
          } catch { /* non-fatal */ }
        })();

        fastify.log.info({ mintAddress: existingMint, wallet, badgeId }, 'NFT confirmed on-chain');
        return reply.code(200).send({ success: true, status: 'COMPLETED', nftMintAddress: existingMint });
      }

      // Not yet confirmed — client polls GET /claim/status
      return reply.code(200).send({ success: true, status: 'MINTING' });
    },
  );

  /**
   * GET /api/v1/badges/:badgeId/claim/status
   * Poll this after confirm returns { status: 'MINTING' } to check completion.
   * Performs a live on-chain check when status is MINTING.
   */
  fastify.get<{ Params: { badgeId: string } }>(
    '/api/v1/badges/:badgeId/claim/status',
    async (request, reply) => {
      const wallet = request.user.sub;
      const { badgeId } = request.params;

      const [badge] = await db
        .select({
          nftMintStatus: badges.nftMintStatus,
          nftMintAddress: badges.nftMintAddress,
          nftTxSignature: badges.nftTxSignature,
          nftMintFailureReason: badges.nftMintFailureReason,
          nftSeedSalt: badges.nftSeedSalt,
          nftMintStartedAt: badges.nftMintStartedAt,
        })
        .from(badges)
        .where(and(eq(badges.walletAddress, wallet), eq(badges.badgeId, badgeId)))
        .limit(1);

      if (!badge) return reply.code(404).send({ error: 'BADGE_NOT_FOUND' });

      if (badge.nftMintStatus === 'COMPLETED') {
        return reply.code(200).send({ status: 'COMPLETED', nftMintAddress: badge.nftMintAddress });
      }

      // Live on-chain check while MINTING
      if (badge.nftMintStatus === 'MINTING') {
        const seedSalt = badge.nftSeedSalt ?? undefined;
        const existingMint = await checkDeterministicMintExists(wallet, badgeId, seedSalt);
        if (existingMint) {
          await db.execute(sql`
            UPDATE badges
            SET nft_mint_address = ${existingMint},
                nft_mint_status = 'COMPLETED',
                pending_claim_mint = NULL,
                pending_claim_expires_at = NULL
            WHERE wallet_address = ${wallet}
              AND badge_id = ${badgeId}
              AND nft_mint_status = 'MINTING'
          `);

          // Fire-and-forget: collection verify + cache warm
          void verifyCollectionMembership(existingMint).catch(() => {});
          void (async () => {
            try {
              const seed = creatureSeed(wallet, badgeId, seedSalt);
              const [{ gif }, { png }] = await Promise.all([
                import('../lib/creature.js').then(m => m.generateCreatureGif(seed, badgeId)),
                import('../lib/creature.js').then(m => m.generateCreaturePng(seed, badgeId)),
              ]);
              await Promise.all([
                redis.setex(`creature:gif:${wallet}:${badgeId}`, 60 * 60 * 24 * 365, Buffer.from(gif)),
                redis.setex(`creature:png:${wallet}:${badgeId}`, 60 * 60 * 24 * 365, Buffer.from(png)),
              ]);
            } catch { /* non-fatal */ }
          })();

          return reply.code(200).send({ status: 'COMPLETED', nftMintAddress: existingMint });
        }

        // Auto-fail if stuck in MINTING for > 5 minutes (tx likely expired)
        if (badge.nftMintStartedAt && Date.now() - badge.nftMintStartedAt.getTime() > 5 * 60 * 1000) {
          await db
            .update(badges)
            .set({
              nftMintStatus: 'MINT_FAILED',
              nftMintFailureReason: 'Transaction expired. Please try again.',
            })
            .where(and(
              eq(badges.walletAddress, wallet),
              eq(badges.badgeId, badgeId),
              sql`nft_mint_status = 'MINTING'`,
            ));
          return reply.code(200).send({
            status: 'MINT_FAILED',
            reason: 'Transaction expired. Please try again.',
          });
        }

        return reply.code(200).send({ status: 'MINTING' });
      }

      if (badge.nftMintStatus === 'MINT_FAILED') {
        return reply.code(200).send({
          status: 'MINT_FAILED',
          reason: badge.nftMintFailureReason,
          nftTxSignature: badge.nftTxSignature,
        });
      }
      // PENDING_CLAIM or PENDING
      return reply.code(200).send({ status: badge.nftMintStatus });
    },
  );
}

export async function perksRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /api/v1/perks
  fastify.get('/api/v1/perks', async (request, reply) => {
    const wallet = request.user.sub;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.walletAddress, wallet))
      .limit(1);

    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const allPerks = await db
      .select()
      .from(perks)
      .where(eq(perks.isActive, true));

    // Get user's claims
    const userClaims = await db
      .select()
      .from(perkClaims)
      .where(eq(perkClaims.userId, user.id));
    const claimedPerkIds = new Set(userClaims.map(c => c.perkId));

    // Get user's earned badge IDs
    const userBadges = await db
      .select({ badgeId: badges.badgeId })
      .from(badges)
      .where(eq(badges.userId, user.id));
    const earnedBadgeIds = new Set(userBadges.map(b => b.badgeId));

    return reply.code(200).send(
      allPerks.map(p => {
        const userClaimed = claimedPerkIds.has(p.id);
        const meetsStreak = !p.requiredStreak || user.currentStreak >= p.requiredStreak;
        const meetsBadge = !p.requiredBadgeId || earnedBadgeIds.has(p.requiredBadgeId);
        const notSoldOut = !p.totalSupply || p.claimedCount < p.totalSupply;
        // STREAK_SHIELD: re-claimable if consumed (shield not active)
        const isConsumedShield = p.rewardType === 'STREAK_SHIELD' && userClaimed && !user.streakShieldActive;
        const eligible = (meetsStreak && meetsBadge && notSoldOut && !userClaimed) || isConsumedShield;

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          provider: p.provider,
          imageUrl: p.imageUrl,
          requiredBadgeId: p.requiredBadgeId,
          requiredStreak: p.requiredStreak,
          rewardType: p.rewardType,
          totalSupply: p.totalSupply,
          claimedCount: p.claimedCount,
          userClaimed,
          userEligible: eligible,
          streakShieldActive: p.rewardType === 'STREAK_SHIELD' ? user.streakShieldActive : undefined,
        };
      })
    );
  });

  // POST /api/v1/perks/:id/claim
  fastify.post('/api/v1/perks/:id/claim', async (request, reply) => {
    const wallet = request.user.sub;
    const { id: perkId } = z.object({ id: z.string().uuid() }).parse(request.params);
    const perkClaimSchema = z.object({ proofSignature: z.string().optional() });
    const body = perkClaimSchema.parse(request.body ?? {});

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.walletAddress, wallet))
      .limit(1);

    if (!user) return reply.code(404).send({ error: 'USER_NOT_FOUND' });

    const [perk] = await db
      .select()
      .from(perks)
      .where(and(eq(perks.id, perkId), eq(perks.isActive, true)))
      .limit(1);

    if (!perk) return reply.code(404).send({ error: 'PERK_NOT_FOUND' });

    // Check already claimed -- STREAK_SHIELD perks can be re-claimed once consumed
    const [existingClaim] = await db
      .select()
      .from(perkClaims)
      .where(and(eq(perkClaims.userId, user.id), eq(perkClaims.perkId, perkId)))
      .limit(1);

    if (existingClaim) {
      if (perk.rewardType === 'STREAK_SHIELD' && !user.streakShieldActive) {
        // Shield was consumed -- re-claim is handled atomically inside the transaction below
      } else {
        return reply.code(409).send({ error: 'ALREADY_CLAIMED' });
      }
    }

    // Check streak requirement
    if (perk.requiredStreak && user.currentStreak < perk.requiredStreak) {
      return reply.code(403).send({ error: 'STREAK_REQUIREMENT_NOT_MET' });
    }

    // Check badge requirement
    if (perk.requiredBadgeId) {
      const [requiredBadge] = await db
        .select({ badgeId: badges.badgeId })
        .from(badges)
        .where(and(eq(badges.userId, user.id), eq(badges.badgeId, perk.requiredBadgeId)))
        .limit(1);
      if (!requiredBadge) {
        return reply.code(403).send({ error: 'BADGE_REQUIREMENT_NOT_MET' });
      }
    }

    // Check supply
    if (perk.totalSupply && perk.claimedCount >= perk.totalSupply) {
      return reply.code(410).send({ error: 'SOLD_OUT' });
    }

    // Atomic claim: insert claim + increment counter + recheck supply in one transaction
    let claim;
    try {
      claim = await db.transaction(async (tx) => {
        // Recheck supply inside transaction with FOR UPDATE lock to prevent TOCTOU race
        const [freshPerk] = await tx.execute(
          sql`SELECT claimed_count, total_supply FROM perks WHERE id = ${perkId} FOR UPDATE`
        ) as unknown as [Record<string, unknown>];

        if (freshPerk?.total_supply && (freshPerk.claimed_count as number) >= (freshPerk.total_supply as number)) {
          throw new Error('SOLD_OUT');
        }

        // For STREAK_SHIELD re-claims: atomically delete the old claim before inserting the
        // new one. Doing this inside the transaction prevents the race where two concurrent
        // requests both see the shield consumed, both delete outside the tx, and both try
        // to insert — which would hit the UNIQUE(user_id, perk_id) constraint.
        if (existingClaim) {
          await tx.delete(perkClaims).where(eq(perkClaims.id, existingClaim.id));
        }

        const [record] = await tx
          .insert(perkClaims)
          .values({
            perkId,
            userId: user.id,
            walletAddress: wallet,
            proofSignature: body.proofSignature,
          })
          .returning();

        // Only count first-time claims against the supply; re-claims are replace-in-place
        // (old row deleted, new row inserted) so the net supply change is zero.
        if (!existingClaim) {
          await tx
            .update(perks)
            .set({ claimedCount: sql`${perks.claimedCount} + 1` })
            .where(eq(perks.id, perkId));
        }

        // If this is a STREAK_SHIELD perk, activate the shield on the user
        if (perk.rewardType === 'STREAK_SHIELD') {
          await tx
            .update(users)
            .set({
              streakShieldActive: true,
              streakShields: sql`LEAST(${users.streakShields} + 1, ${MAX_SHIELDS})`,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));
        }

        // If this is a PROFILE_TITLE perk, set the title on the user
        if (perk.rewardType === 'PROFILE_TITLE') {
          await tx
            .update(users)
            .set({ profileTitle: perk.name, updatedAt: new Date() })
            .where(eq(users.id, user.id));
        }

        return record!;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SOLD_OUT') {
        return reply.code(410).send({ error: 'SOLD_OUT' });
      }
      throw err;
    }

    return reply.code(200).send({
      perkId,
      claimed: true,
      claimedAt: claim.claimedAt.toISOString(),
    });
  });
}

