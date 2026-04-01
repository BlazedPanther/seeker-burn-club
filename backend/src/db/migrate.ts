import postgres from 'postgres';
import { env } from '../config/env.js';

/**
 * Run initial migration SQL to create all tables.
 * In production, use drizzle-kit generate + migrate instead.
 */
async function migrate() {
  const sql = postgres(env.DATABASE_URL);

  console.log('Running migrations...');

  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  // users
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address      VARCHAR(44) NOT NULL UNIQUE,
      referral_code       VARCHAR(20) UNIQUE,
      referred_by_user_id UUID,
      referral_applied_at TIMESTAMPTZ,
      referral_qualified_count INTEGER NOT NULL DEFAULT 0,
      current_streak      INTEGER NOT NULL DEFAULT 0,
      longest_streak      INTEGER NOT NULL DEFAULT 0,
      lifetime_burned     NUMERIC(20,6) NOT NULL DEFAULT 0,
      total_deposited     NUMERIC(20,6) NOT NULL DEFAULT 0,
      last_burn_date      DATE,
      last_burn_at        TIMESTAMPTZ,
      streak_broken_at    TIMESTAMPTZ,
      badge_count         INTEGER NOT NULL DEFAULT 0,
      device_fingerprint  VARCHAR(255),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // burns
  await sql`
    CREATE TABLE IF NOT EXISTS burns (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID NOT NULL REFERENCES users(id),
      wallet_address      VARCHAR(44) NOT NULL,
      tx_signature        VARCHAR(88) NOT NULL UNIQUE,
      burn_amount         NUMERIC(20,6) NOT NULL,
      fee_amount          NUMERIC(20,6) NOT NULL DEFAULT 0,
      burn_date           DATE NOT NULL,
      streak_day          INTEGER NOT NULL,
      slot                BIGINT NOT NULL,
      block_time          TIMESTAMPTZ NOT NULL,
      status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      verification_error  TEXT,
      badge_earned_id     VARCHAR(20),
      nft_mint_address    VARCHAR(44),
      nft_tx_signature    VARCHAR(88),
      device_fingerprint  VARCHAR(255),
      client_ip           INET,
      submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_at         TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // deposits
  await sql`
    CREATE TABLE IF NOT EXISTS deposits (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID NOT NULL REFERENCES users(id),
      wallet_address      VARCHAR(44) NOT NULL,
      tx_signature        VARCHAR(88) NOT NULL UNIQUE,
      amount              NUMERIC(20,6) NOT NULL,
      slot                BIGINT NOT NULL,
      block_time          TIMESTAMPTZ NOT NULL,
      status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      verification_error  TEXT,
      submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_at         TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // badges
  await sql`
    CREATE TABLE IF NOT EXISTS badges (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID NOT NULL REFERENCES users(id),
      wallet_address      VARCHAR(44) NOT NULL,
      badge_id            VARCHAR(20) NOT NULL,
      badge_type          VARCHAR(10) NOT NULL,
      requirement_value   INTEGER NOT NULL,
      nft_mint_address    VARCHAR(44),
      nft_tx_signature    VARCHAR(88),
      nft_mint_status     VARCHAR(20) DEFAULT 'PENDING',
      earned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, badge_id)
    )
  `;

  // perks
  await sql`
    CREATE TABLE IF NOT EXISTS perks (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug                VARCHAR(50) NOT NULL UNIQUE,
      name                VARCHAR(100) NOT NULL,
      description         TEXT NOT NULL,
      provider            VARCHAR(100),
      image_url           TEXT,
      required_badge_id   VARCHAR(20),
      required_streak     INTEGER,
      reward_type         VARCHAR(20) NOT NULL,
      total_supply        INTEGER,
      claimed_count       INTEGER NOT NULL DEFAULT 0,
      is_active           BOOLEAN NOT NULL DEFAULT true,
      starts_at           TIMESTAMPTZ,
      expires_at          TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // perk_claims
  await sql`
    CREATE TABLE IF NOT EXISTS perk_claims (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      perk_id             UUID NOT NULL REFERENCES perks(id),
      user_id             UUID NOT NULL REFERENCES users(id),
      wallet_address      VARCHAR(44) NOT NULL,
      reward_value        TEXT,
      proof_signature     VARCHAR(128),
      claimed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, perk_id)
    )
  `;

  // auth_sessions
  await sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address      VARCHAR(44) NOT NULL,
      token_hash          VARCHAR(64) NOT NULL,
      device_fingerprint  VARCHAR(255),
      ip_address          INET,
      user_agent          TEXT,
      expires_at          TIMESTAMPTZ NOT NULL,
      revoked_at          TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // auth_challenges
  await sql`
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address      VARCHAR(44) NOT NULL,
      nonce               VARCHAR(64) NOT NULL UNIQUE,
      ip_address          INET,
      expires_at          TIMESTAMPTZ NOT NULL,
      used_at             TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // referrals
  await sql`
    CREATE TABLE IF NOT EXISTS referrals (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id    UUID NOT NULL REFERENCES users(id),
      referee_user_id     UUID NOT NULL REFERENCES users(id),
      referral_code       VARCHAR(20) NOT NULL,
      status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      rejection_reason    VARCHAR(80),
      qualified_at        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (referee_user_id),
      UNIQUE (referrer_user_id, referee_user_id)
    )
  `;

  // daily_stats
  await sql`
    CREATE TABLE IF NOT EXISTS daily_stats (
      date                DATE PRIMARY KEY,
      total_burns         INTEGER NOT NULL DEFAULT 0,
      total_burn_amount   NUMERIC(20,6) NOT NULL DEFAULT 0,
      total_fee_amount    NUMERIC(20,6) NOT NULL DEFAULT 0,
      total_deposits      INTEGER NOT NULL DEFAULT 0,
      total_deposit_amount NUMERIC(20,6) NOT NULL DEFAULT 0,
      unique_burners      INTEGER NOT NULL DEFAULT 0,
      new_users           INTEGER NOT NULL DEFAULT 0,
      badges_minted       INTEGER NOT NULL DEFAULT 0,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // security_logs
  await sql`
    CREATE TABLE IF NOT EXISTS security_logs (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type          VARCHAR(50) NOT NULL,
      wallet_address      VARCHAR(44),
      device_fingerprint  VARCHAR(255),
      ip_address          INET,
      details             JSONB,
      severity            VARCHAR(10) NOT NULL DEFAULT 'INFO',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // ── XP system tables ──
  await sql`
    CREATE TABLE IF NOT EXISTS xp_ledger (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id),
      amount      INTEGER NOT NULL,
      reason      VARCHAR(50) NOT NULL,
      ref_id      VARCHAR(100),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_challenge_progress (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id),
      challenge_date  DATE NOT NULL,
      challenge_id    VARCHAR(30) NOT NULL,
      completed       BOOLEAN NOT NULL DEFAULT false,
      progress_value  NUMERIC(20,6) NOT NULL DEFAULT 0,
      xp_awarded      INTEGER NOT NULL DEFAULT 0,
      completed_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, challenge_date, challenge_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS weekly_challenge_progress (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id),
      week_start      DATE NOT NULL,
      challenge_id    VARCHAR(30) NOT NULL,
      completed       BOOLEAN NOT NULL DEFAULT false,
      progress_value  NUMERIC(20,6) NOT NULL DEFAULT 0,
      xp_awarded      INTEGER NOT NULL DEFAULT 0,
      completed_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, week_start, challenge_id)
    )
  `;

  // ── Shield shop tables ──
  await sql`
    CREATE TABLE IF NOT EXISTS shield_purchases (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id),
      wallet_address  VARCHAR(44) NOT NULL,
      tx_signature    VARCHAR(88) NOT NULL UNIQUE,
      shield_count    INTEGER NOT NULL,
      price_lamports  NUMERIC(20,0) NOT NULL,
      price_usd       NUMERIC(10,2) NOT NULL,
      currency        VARCHAR(10) NOT NULL DEFAULT 'SOL',
      status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      verified_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // ── Lucky drops tables ──
  await sql`
    CREATE TABLE IF NOT EXISTS lucky_drops (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id),
      burn_id     UUID NOT NULL,
      item_id     VARCHAR(40) NOT NULL,
      rarity      VARCHAR(20) NOT NULL,
      applied     BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS active_buffs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id),
      buff_type       VARCHAR(40) NOT NULL,
      remaining_uses  INTEGER NOT NULL DEFAULT 1,
      metadata        JSONB DEFAULT '{}',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_inventory (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id),
      item_id     VARCHAR(40) NOT NULL,
      quantity    INTEGER NOT NULL DEFAULT 1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, item_id)
    )
  `;

  // ── Streak Shield ──
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_shield_active BOOLEAN NOT NULL DEFAULT false`).catch(() => {});

  // ── Unlimited burns per day ──
  // Remove legacy unique-per-day index if it exists from older deployments.
  await sql.unsafe(`DROP INDEX IF EXISTS idx_burns_wallet_date`).catch(() => {});

  // ── New columns for badge claim flow (pending_claim_mint, pending_claim_expires_at) ──
  await sql.unsafe(`ALTER TABLE badges ADD COLUMN IF NOT EXISTS pending_claim_mint VARCHAR(44)`).catch(() => {});
  await sql.unsafe(`ALTER TABLE badges ADD COLUMN IF NOT EXISTS pending_claim_expires_at TIMESTAMPTZ`).catch(() => {});
  await sql.unsafe(`ALTER TABLE badges ADD COLUMN IF NOT EXISTS nft_seed_salt VARCHAR(64)`).catch(() => {});

  // ── Profile title for perk rewards ──
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_title VARCHAR(40)`).catch(() => {});

  // ── XP & level columns ──
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS xp NUMERIC(20,0) NOT NULL DEFAULT 0`).catch(() => {});
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_shields INTEGER NOT NULL DEFAULT 0`).catch(() => {});

  // ── Badge mint tracking columns ──
  await sql.unsafe(`ALTER TABLE badges ADD COLUMN IF NOT EXISTS nft_mint_started_at TIMESTAMPTZ`).catch(() => {});
  await sql.unsafe(`ALTER TABLE badges ADD COLUMN IF NOT EXISTS nft_mint_failure_reason TEXT`).catch(() => {});

  // ── New columns for referral system ──
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)`).catch(() => {});
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id UUID`).catch(() => {});
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_applied_at TIMESTAMPTZ`).catch(() => {});
  await sql.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_qualified_count INTEGER NOT NULL DEFAULT 0`).catch(() => {});

  // Ensure uniqueness on referral_code for existing deployments
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique ON users (referral_code) WHERE referral_code IS NOT NULL`).catch(() => {});

  // ── Performance indexes for 250k+ users ──
  // Users table
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_users_streak ON users (current_streak)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_users_lifetime ON users (lifetime_burned)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_users_badges ON users (badge_count)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_users_last_burn ON users (last_burn_date)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by_user_id)`).catch(() => {});

  // Burns table
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_burns_user ON burns (user_id, created_at)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_burns_status ON burns (status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_burns_date ON burns (burn_date)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_burns_wallet_date_lookup ON burns (wallet_address, burn_date)`).catch(() => {});

  // Deposits table
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits (user_id, created_at)`).catch(() => {});

  // Badges table
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_badges_wallet ON badges (wallet_address)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_badges_mint_status ON badges (nft_mint_status)`).catch(() => {});

  // Auth sessions & challenges
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON auth_sessions (wallet_address)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth_sessions (token_hash)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_challenges_expires ON auth_challenges (expires_at)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_challenges_created ON auth_challenges (created_at)`).catch(() => {});

  // Security logs
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_security_type ON security_logs (event_type, created_at)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_security_wallet ON security_logs (wallet_address, created_at)`).catch(() => {});

  // Perks & perk claims
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_perks_active ON perks (is_active)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_perk_claims_perk ON perk_claims (perk_id)`).catch(() => {});

  // Referrals
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_user_id, created_at)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (referral_code)`).catch(() => {});

  // XP system
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_users_xp ON users (xp)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_users_level ON users (level)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger (user_id, created_at)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_daily_challenge_date ON daily_challenge_progress (user_id, challenge_date)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_weekly_challenge_week ON weekly_challenge_progress (user_id, week_start)`).catch(() => {});

  // Shield purchases
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_shield_purchases_user ON shield_purchases (user_id, created_at)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_shield_purchases_status ON shield_purchases (status)`).catch(() => {});

  // Lucky drops & buffs
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_lucky_drops_user ON lucky_drops (user_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_lucky_drops_burn ON lucky_drops (burn_id)`).catch(() => {});
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_active_buffs_user ON active_buffs (user_id, buff_type)`).catch(() => {});

  // ── Alter existing columns: widen device_fingerprint from VARCHAR(64) → VARCHAR(255) ──
  // Safe for existing databases where tables already exist (CREATE TABLE IF NOT EXISTS is a no-op).
  for (const tbl of ['users', 'burns', 'auth_sessions', 'security_logs']) {
    await sql.unsafe(
      `ALTER TABLE ${tbl} ALTER COLUMN device_fingerprint TYPE VARCHAR(255)`,
    ).catch((e: Error) => { console.warn(`Migration: widen device_fingerprint on ${tbl}:`, e.message); });
  }

  console.log('Migrations complete.');
  await sql.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
