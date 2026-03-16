import { and, eq, isNull, sql } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { db } from '../db/client.js';
import { authSessions, referrals, users, burns } from '../db/schema.js';
import { env } from '../config/env.js';
import { securityLog } from '../lib/security.js';

const codeAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isReferralCodeFormatValid(code: string): boolean {
  return /^SBC-[A-Z2-9]{8}$/.test(normalizeCode(code));
}

function makeCode(): string {
  return `SBC-${codeAlphabet()}`;
}

async function ensureReferralCodeForUserTx(userId: string) {
  return db.transaction(async (tx) => {
    // Advisory lock on this user to prevent concurrent code generation races
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const [existing] = await tx
      .select({ referralCode: users.referralCode })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existing) throw new Error('USER_NOT_FOUND');
    if (existing.referralCode) return existing.referralCode;

    for (let i = 0; i < 24; i++) {
      const candidate = makeCode();

      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.referralCode, candidate))
        .limit(1);
      if (taken) continue;

      const updated = await tx
        .update(users)
        .set({ referralCode: candidate, updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.referralCode)))
        .returning({ referralCode: users.referralCode });

      if (updated[0]?.referralCode) return updated[0].referralCode;

      // Another concurrent transaction set the code — reload
      const [reloaded] = await tx
        .select({ referralCode: users.referralCode })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (reloaded?.referralCode) return reloaded.referralCode;
    }

    throw new Error('REFERRAL_CODE_GENERATION_FAILED');
  });
}

export async function ensureReferralCodeForWallet(walletAddress: string): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);

  if (!user) throw new Error('USER_NOT_FOUND');
  return ensureReferralCodeForUserTx(user.id);
}

async function hasSharedIp(referrerWallet: string, refereeWallet: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1
    FROM auth_sessions a
    JOIN auth_sessions b ON a.ip_address = b.ip_address
    WHERE a.wallet_address = ${referrerWallet}
      AND b.wallet_address = ${refereeWallet}
      AND a.ip_address IS NOT NULL
    LIMIT 1
  `);
  return rows.length > 0;
}

export async function applyReferralCode(
  refereeWallet: string,
  codeInput: string,
  deviceFingerprint: string | undefined,
  ipAddress: string | undefined,
): Promise<{ status: 'PENDING' | 'QUALIFIED'; referrerWallet: string }> {
  const code = normalizeCode(codeInput);
  const enforceSybilChecks = env.REFERRAL_ENFORCE_SYBIL_CHECKS;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${refereeWallet}))`);

    const [referee] = await tx
      .select()
      .from(users)
      .where(eq(users.walletAddress, refereeWallet))
      .limit(1);
    if (!referee) throw new Error('USER_NOT_FOUND');

    if (referee.referredByUserId) throw new Error('REFERRAL_ALREADY_APPLIED');

    const accountAgeMs = Date.now() - new Date(referee.createdAt).getTime();
    const maxAgeMs = env.REFERRAL_APPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (accountAgeMs > maxAgeMs) throw new Error('REFERRAL_WINDOW_EXPIRED');

    const [referrer] = await tx
      .select()
      .from(users)
      .where(eq(users.referralCode, code))
      .limit(1);
    if (!referrer) throw new Error('REFERRAL_CODE_INVALID');

    if (referrer.id === referee.id) throw new Error('REFERRAL_SELF_NOT_ALLOWED');

    // Sybil protection 1: same device fingerprint between source and target user.
    if (enforceSybilChecks && deviceFingerprint && referrer.deviceFingerprint && referrer.deviceFingerprint === deviceFingerprint) {
      await tx.insert(referrals).values({
        referrerUserId: referrer.id,
        refereeUserId: referee.id,
        referralCode: code,
        status: 'REJECTED',
        rejectionReason: 'SAME_DEVICE_FINGERPRINT',
      }).onConflictDoNothing({ target: [referrals.refereeUserId] });

      securityLog({
        eventType: 'REFERRAL_REJECTED',
        walletAddress: refereeWallet,
        deviceFingerprint,
        ipAddress,
        severity: 'WARN',
        details: { reason: 'SAME_DEVICE_FINGERPRINT', code, referrerWallet: referrer.walletAddress },
      });
      throw new Error('REFERRAL_REJECTED_SYBIL');
    }

    // Sybil protection 2: historical shared IP across auth sessions.
    if (enforceSybilChecks && await hasSharedIp(referrer.walletAddress, refereeWallet)) {
      await tx.insert(referrals).values({
        referrerUserId: referrer.id,
        refereeUserId: referee.id,
        referralCode: code,
        status: 'REJECTED',
        rejectionReason: 'SHARED_IP_HISTORY',
      }).onConflictDoNothing({ target: [referrals.refereeUserId] });

      securityLog({
        eventType: 'REFERRAL_REJECTED',
        walletAddress: refereeWallet,
        deviceFingerprint,
        ipAddress,
        severity: 'WARN',
        details: { reason: 'SHARED_IP_HISTORY', code, referrerWallet: referrer.walletAddress },
      });
      throw new Error('REFERRAL_REJECTED_SYBIL');
    }

    await tx.insert(referrals).values({
      referrerUserId: referrer.id,
      refereeUserId: referee.id,
      referralCode: code,
      status: 'PENDING',
    }).onConflictDoNothing({ target: [referrals.refereeUserId] });

    await tx
      .update(users)
      .set({
        referredByUserId: referrer.id,
        referralAppliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, referee.id));

    securityLog({
      eventType: 'REFERRAL_APPLIED',
      walletAddress: refereeWallet,
      deviceFingerprint,
      ipAddress,
      severity: 'INFO',
      details: { code, referrerWallet: referrer.walletAddress },
    });

    return { status: 'PENDING' as const, referrerWallet: referrer.walletAddress };
  });
}

export async function evaluateReferralQualification(refereeUserId: string): Promise<void> {
  const [referral] = await db
    .select({
      id: referrals.id,
      referrerUserId: referrals.referrerUserId,
      status: referrals.status,
    })
    .from(referrals)
    .where(eq(referrals.refereeUserId, refereeUserId))
    .limit(1);

  if (!referral || referral.status !== 'PENDING') return;

  const [user] = await db
    .select({ lifetimeBurned: users.lifetimeBurned })
    .from(users)
    .where(eq(users.id, refereeUserId))
    .limit(1);
  if (!user) return;

  const [daysRow] = await db
    .select({ burnDays: sql<number>`COUNT(DISTINCT burn_date)::int` })
    .from(burns)
    .where(and(eq(burns.userId, refereeUserId), eq(burns.status, 'VERIFIED')));

  const burnDays = daysRow?.burnDays ?? 0;
  const lifetime = parseFloat(user.lifetimeBurned ?? '0');
  const qualified = isReferralQualified(burnDays, lifetime);
  if (!qualified) return;

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(referrals)
      .set({
        status: 'QUALIFIED',
        qualifiedAt: new Date(),
      })
      .where(and(eq(referrals.id, referral.id), eq(referrals.status, 'PENDING')))
      .returning({ id: referrals.id });

    if (updated.length === 0) return;

    await tx
      .update(users)
      .set({
        referralQualifiedCount: sql`${users.referralQualifiedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, referral.referrerUserId));
  });

  securityLog({
    eventType: 'REFERRAL_QUALIFIED',
    severity: 'INFO',
    details: { refereeUserId, referralId: referral.id },
  });
}

export function isReferralQualified(burnDays: number, lifetimeBurned: number): boolean {
  return burnDays >= env.REFERRAL_QUALIFY_BURN_DAYS && lifetimeBurned >= env.REFERRAL_QUALIFY_LIFETIME_SKR;
}

export async function getReferralOverview(walletAddress: string) {
  const [user] = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
      referralCode: users.referralCode,
      referredByUserId: users.referredByUserId,
      referralAppliedAt: users.referralAppliedAt,
      referralQualifiedCount: users.referralQualifiedCount,
    })
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);

  if (!user) throw new Error('USER_NOT_FOUND');

  const referralCode = user.referralCode ?? await ensureReferralCodeForWallet(walletAddress);

  const [counts] = await db.execute(sql`
    SELECT
      COUNT(*)::int AS invited,
      COUNT(*) FILTER (WHERE status = 'QUALIFIED')::int AS qualified,
      COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected
    FROM referrals
    WHERE referrer_user_id = ${user.id}
  `);

  const [referrer] = user.referredByUserId
    ? await db
      .select({ walletAddress: users.walletAddress, referralCode: users.referralCode })
      .from(users)
      .where(eq(users.id, user.referredByUserId))
      .limit(1)
    : [null];

  return {
    referralCode,
    canApplyReferral: !user.referredByUserId,
    referredBy: referrer
      ? {
        walletAddress: referrer.walletAddress,
        referralCode: referrer.referralCode,
        appliedAt: user.referralAppliedAt?.toISOString() ?? null,
      }
      : null,
    stats: {
      invited: Number((counts as { invited: number })?.invited ?? 0),
      qualified: Number((counts as { qualified: number })?.qualified ?? user.referralQualifiedCount ?? 0),
      pending: Number((counts as { pending: number })?.pending ?? 0),
      rejected: Number((counts as { rejected: number })?.rejected ?? 0),
    },
  };
}

export async function getReferralHistory(walletAddress: string) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);
  if (!user) throw new Error('USER_NOT_FOUND');

  const rows = await db.execute(sql`
    SELECT
      r.id,
      u.wallet_address AS referee_wallet,
      r.status,
      r.rejection_reason,
      r.created_at,
      r.qualified_at
    FROM referrals r
    JOIN users u ON u.id = r.referee_user_id
    WHERE r.referrer_user_id = ${user.id}
    ORDER BY r.created_at DESC
    LIMIT 100
  `);

  const toIsoOrNull = (value: unknown): string | null => {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();

    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  return rows.map((row: unknown) => {
    const r = row as {
      id: string;
      referee_wallet: string;
      status: string;
      rejection_reason: string | null;
      created_at: Date | string;
      qualified_at: Date | string | null;
    };
    const createdAt = toIsoOrNull(r.created_at);
    return {
      id: r.id,
      refereeWallet: r.referee_wallet,
      status: r.status,
      rejectionReason: r.rejection_reason,
      createdAt: createdAt ?? new Date(0).toISOString(),
      qualifiedAt: toIsoOrNull(r.qualified_at),
    };
  });
}
