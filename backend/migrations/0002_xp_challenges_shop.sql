-- Migration: XP system, daily/weekly challenges, streak shield shop
-- Run after 0001_add_mint_recovery_columns.sql

-- ──────────────────────────────────────────
-- XP columns on users table
-- ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_shields INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_title VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_users_xp ON users (xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_level ON users (level DESC);

-- ──────────────────────────────────────────
-- XP ledger — every XP gain/spend is recorded
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xp_ledger (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  amount     INTEGER NOT NULL,        -- positive = gain, negative = spend
  reason     VARCHAR(50) NOT NULL,     -- 'BURN', 'BADGE_EARNED', 'DAILY_CHALLENGE', 'WEEKLY_CHALLENGE', 'DAILY_SWEEP', 'LEVEL_UP_REWARD', 'RETROACTIVE', 'SHIELD_PURCHASE'
  ref_id     VARCHAR(100),             -- optional: burn id, badge id, challenge id, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger (user_id, created_at DESC);

-- ──────────────────────────────────────────
-- Daily challenge progress
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_challenge_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  challenge_date DATE NOT NULL,
  challenge_id  VARCHAR(30) NOT NULL,    -- e.g. 'ignite', 'double_burn', 'early_bird'
  completed     BOOLEAN NOT NULL DEFAULT false,
  progress_value NUMERIC(20,6) NOT NULL DEFAULT 0,
  xp_awarded    INTEGER NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_challenge_unique ON daily_challenge_progress (user_id, challenge_date, challenge_id);
CREATE INDEX IF NOT EXISTS idx_daily_challenge_date ON daily_challenge_progress (user_id, challenge_date);

-- ──────────────────────────────────────────
-- Weekly challenge progress
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_challenge_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  week_start    DATE NOT NULL,             -- Monday of the ISO week
  challenge_id  VARCHAR(30) NOT NULL,
  completed     BOOLEAN NOT NULL DEFAULT false,
  progress_value NUMERIC(20,6) NOT NULL DEFAULT 0,
  xp_awarded    INTEGER NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_challenge_unique ON weekly_challenge_progress (user_id, week_start, challenge_id);
CREATE INDEX IF NOT EXISTS idx_weekly_challenge_week ON weekly_challenge_progress (user_id, week_start);

-- ──────────────────────────────────────────
-- Shield purchase history
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shield_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  wallet_address  VARCHAR(44) NOT NULL,
  tx_signature    VARCHAR(88) NOT NULL UNIQUE,
  shield_count    INTEGER NOT NULL,
  price_lamports  BIGINT NOT NULL,
  price_usd       NUMERIC(10,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, VERIFIED, FAILED
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shield_purchases_user ON shield_purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shield_purchases_status ON shield_purchases (status);

-- ──────────────────────────────────────────
-- Drop profile_title from schema if it conflicts (already exists as profileTitle)
-- streak_shield_active remains for backward compat (consumed by scheduler)
-- ──────────────────────────────────────────
