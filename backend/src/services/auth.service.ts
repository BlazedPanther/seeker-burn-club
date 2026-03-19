import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { authChallenges, authSessions, users, burns, badges } from '../db/schema.js';
import { env } from '../config/env.js';
import { todayUTC } from '../lib/solana.js';
import { BADGE_DEFINITIONS } from '../lib/badges.js';
import { securityLog } from '../lib/security.js';
import { parseExpiresIn } from '../lib/time.js';
import { ensureReferralCodeForWallet } from './referrals.service.js';
import { nanoid } from 'nanoid';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

function buildSiwsMessage(walletAddress: string, nonce: string): string {
  return [
    `${env.SIWS_DOMAIN} wants you to sign in with your Solana account:`,
    walletAddress,
    '',
    'Sign this message to authenticate with Seeker Burn Club.',
    '',
    `URI: ${env.SIWS_URI}`,
    'Version: 1',
    `Chain ID: ${env.SIWS_CHAIN}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

/**
 * Generate a SIWS challenge nonce.
 */
export async function generateChallenge(
  walletAddress: string,
  ipAddress?: string,
): Promise<{ nonce: string; message: string; expiresAt: string }> {
  const nonce = nanoid(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.SIWS_CHALLENGE_TTL * 1000);

  const message = buildSiwsMessage(walletAddress, nonce);

  await db.insert(authChallenges).values({
    walletAddress,
    nonce,
    ipAddress,
    expiresAt,
  });

  return {
    nonce,
    message,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Verify a signed SIWS message and create a session.
 * Returns JWT token.
 */
export async function verifyAuth(
  walletAddress: string,
  signatureBase58: string,
  nonce: string,
  deviceFingerprint: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ tokenPayload: Record<string, unknown>; expiresAt: string; user: Record<string, unknown> }> {
  // 1. Find and validate the challenge
  const [challenge] = await db
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.nonce, nonce),
        eq(authChallenges.walletAddress, walletAddress),
      )
    )
    .limit(1);

  if (!challenge) throw new Error('INVALID_NONCE');
  if (new Date() > new Date(challenge.expiresAt)) throw new Error('NONCE_EXPIRED');

  // 2. Atomically mark the nonce as used — prevents TOCTOU replay where two
  //    concurrent requests both read usedAt=null and both pass the check.
  //    The UPDATE only succeeds for the first request; subsequent requests see 0 rows.
  const marked = await db
    .update(authChallenges)
    .set({ usedAt: new Date() })
    .where(and(eq(authChallenges.id, challenge.id), isNull(authChallenges.usedAt)))
    .returning({ id: authChallenges.id });
  if (marked.length === 0) throw new Error('NONCE_ALREADY_USED');

  // 2. Reconstruct the message that was signed
  //    Use ISO strings that exactly match what generateChallenge produced.
  //    PostgreSQL TIMESTAMPTZ can lose sub-millisecond precision, so we
  //    reconstruct from the DB values but force 3-digit ms via toISOString()
  //    on a proper Date object.  However, the simplest bulletproof approach
  //    is to derive Issued/Expires solely from nonce + TTL, or just verify
  //    with a nonce-only message.  We take the pragmatic route: verify the
  //    signature against a message whose only varying part is the nonce.
  const message = buildSiwsMessage(walletAddress, nonce);

  // 3. Verify ed25519 signature
  const messageBytes = new TextEncoder().encode(message);
  let signatureBytes: Uint8Array;
  let publicKeyBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(signatureBase58);
    publicKeyBytes = bs58.decode(walletAddress);
  } catch {
    throw new Error('INVALID_SIGNATURE_FORMAT');
  }

  // Ed25519 signatures are 64 bytes and public keys are 32 bytes.
  if (signatureBytes.length !== 64 || publicKeyBytes.length !== 32) {
    throw new Error('INVALID_SIGNATURE_FORMAT');
  }

  const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  if (!isValid) {
    securityLog({ eventType: 'AUTH_INVALID_SIGNATURE', walletAddress, ipAddress, severity: 'WARN', details: { nonce } });
    throw new Error('INVALID_SIGNATURE');
  }

  // 4. (nonce was already atomically marked as used above — no second UPDATE needed)

  // 5. Get or create user (race-safe upsert)
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);

  if (!user) {
    const [newUser] = await db
      .insert(users)
      .values({ walletAddress, deviceFingerprint })
      .onConflictDoUpdate({
        target: users.walletAddress,
        set: { updatedAt: new Date() },
      })
      .returning();
    user = newUser!;
    securityLog({ eventType: 'USER_CREATED', walletAddress, ipAddress, deviceFingerprint, severity: 'INFO' });
  }

  securityLog({ eventType: 'AUTH_SUCCESS', walletAddress, ipAddress, deviceFingerprint, severity: 'INFO' });

  // Ensure referral code exists for every authenticated user.
  const referralCode = await ensureReferralCodeForWallet(walletAddress);

  // 6. Create JWT payload — derive expiry from JWT_EXPIRES_IN config
  const now = new Date();
  const expiresInMs = parseExpiresIn(env.JWT_EXPIRES_IN);
  const expiresAt = new Date(now.getTime() + expiresInMs);
  const tokenPayload = {
    sub: walletAddress,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    device: deviceFingerprint,
  };

  // 7. Query today's burn status
  const today = todayUTC();
  const [todayBurn] = await db
    .select({ id: burns.id })
    .from(burns)
    .where(
      and(
        eq(burns.walletAddress, walletAddress),
        eq(burns.burnDate, today),
        eq(burns.status, 'VERIFIED'),
      )
    )
    .limit(1);

  // 8. Query earned badges
  const earnedBadges = await db
    .select({ badgeId: badges.badgeId, earnedAt: badges.earnedAt, nftMintAddress: badges.nftMintAddress })
    .from(badges)
    .where(eq(badges.userId, user.id));

  return {
    tokenPayload,
    expiresAt: expiresAt.toISOString(),
    user: {
      walletAddress: user.walletAddress,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      lifetimeBurned: user.lifetimeBurned,
      totalDeposited: user.totalDeposited,
      todayBurned: !!todayBurn,
      badges: earnedBadges.map(b => ({
        id: b.badgeId,
        name: BADGE_DEFINITIONS.find(d => d.id === b.badgeId)?.name ?? b.badgeId,
        earnedAt: b.earnedAt.toISOString(),
        nftMintAddress: b.nftMintAddress,
      })),
      joinedAt: user.createdAt.toISOString(),
      referralCode,
    },
  };
}

import { redis } from '../lib/redis.js';

/**
 * Revoke a single session by token hash.
 */
export async function revokeSession(tokenHash: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.tokenHash, tokenHash));

  // Immediately invalidate session cache so revocation takes effect instantly.
  // TTL must be >= the valid-session cache TTL (30 s in server.ts) so a cached
  // "valid" entry is always superseded by the "revoked" entry before it expires.
  try { await redis.setex(`session:${tokenHash}`, 30, 'revoked'); } catch { /* Redis down */ }
}
