-- Manual shield recovery: streak is "recoverable" for 24h instead of auto-consuming shields.
-- Users choose whether to spend a shield to save their streak.

-- Track recoverable streak state
ALTER TABLE users
ADD COLUMN IF NOT EXISTS streak_recovery_deadline TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS streak_recovery_gap_days INTEGER DEFAULT 0;

-- When streak_recovery_deadline IS NOT NULL and > NOW(), the user can POST /shields/recover
-- to consume shield(s) and save their streak. After the deadline, the streak is permanently reset.

CREATE INDEX IF NOT EXISTS idx_users_recovery_deadline ON users(streak_recovery_deadline)
  WHERE streak_recovery_deadline IS NOT NULL;
