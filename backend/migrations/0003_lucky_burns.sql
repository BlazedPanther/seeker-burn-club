-- Lucky Burns: random item drops from burns
-- Tracks items in user inventory and active effects (buffs)

-- ── Lucky drop history ──
CREATE TABLE IF NOT EXISTS lucky_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  burn_id UUID NOT NULL,
  item_id VARCHAR(40) NOT NULL,
  rarity VARCHAR(20) NOT NULL,
  applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lucky_drops_user ON lucky_drops(user_id);
CREATE INDEX IF NOT EXISTS idx_lucky_drops_burn ON lucky_drops(burn_id);

-- ── Active buffs / effects (consumable items that modify next burn) ──
CREATE TABLE IF NOT EXISTS active_buffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buff_type VARCHAR(40) NOT NULL,
  remaining_uses INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_active_buffs_user ON active_buffs(user_id, buff_type);

-- ── User inventory (stackable items not yet used) ──
CREATE TABLE IF NOT EXISTS user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(40) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_user ON user_inventory(user_id);
