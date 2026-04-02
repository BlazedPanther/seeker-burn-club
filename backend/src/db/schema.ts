import { pgTable, uuid, varchar, integer, numeric, date, timestamp, text, inet, boolean, jsonb, bigint, uniqueIndex, index } from 'drizzle-orm/pg-core';

// ──────────────────────────────────────────
// users
// ──────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull().unique(),
  referralCode: varchar('referral_code', { length: 20 }).unique(),
  referredByUserId: uuid('referred_by_user_id'),
  referralAppliedAt: timestamp('referral_applied_at', { withTimezone: true }),
  referralQualifiedCount: integer('referral_qualified_count').notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lifetimeBurned: numeric('lifetime_burned', { precision: 20, scale: 6 }).notNull().default('0'),
  totalDeposited: numeric('total_deposited', { precision: 20, scale: 6 }).notNull().default('0'),
  lastBurnDate: date('last_burn_date'),
  lastBurnAt: timestamp('last_burn_at', { withTimezone: true }),
  streakBrokenAt: timestamp('streak_broken_at', { withTimezone: true }),
  badgeCount: integer('badge_count').notNull().default(0),
  streakShieldActive: boolean('streak_shield_active').notNull().default(false),
  xp: bigint('xp', { mode: 'number' }).notNull().default(0),
  level: integer('level').notNull().default(1),
  streakShields: integer('streak_shields').notNull().default(0),
  streakRecoveryDeadline: timestamp('streak_recovery_deadline', { withTimezone: true }),
  streakRecoveryGapDays: integer('streak_recovery_gap_days').notNull().default(0),
  profileTitle: varchar('profile_title', { length: 40 }),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // walletAddress already has UNIQUE constraint (implicit index)
  streakIdx: index('idx_users_streak').on(t.currentStreak),
  lifetimeIdx: index('idx_users_lifetime').on(t.lifetimeBurned),
  badgesIdx: index('idx_users_badges').on(t.badgeCount),
  lastBurnIdx: index('idx_users_last_burn').on(t.lastBurnDate),
  referralCodeIdx: index('idx_users_referral_code').on(t.referralCode),
  referredByIdx: index('idx_users_referred_by').on(t.referredByUserId),
  xpIdx: index('idx_users_xp').on(t.xp),
  levelIdx: index('idx_users_level').on(t.level),
}));

// ──────────────────────────────────────────
// referrals
// ──────────────────────────────────────────
export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerUserId: uuid('referrer_user_id').notNull().references(() => users.id),
  refereeUserId: uuid('referee_user_id').notNull().references(() => users.id),
  referralCode: varchar('referral_code', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'), // PENDING | QUALIFIED | REJECTED
  rejectionReason: varchar('rejection_reason', { length: 80 }),
  qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  referrerIdx: index('idx_referrals_referrer').on(t.referrerUserId, t.createdAt),
  refereeIdx: uniqueIndex('idx_referrals_referee_unique').on(t.refereeUserId),
  pairIdx: uniqueIndex('idx_referrals_pair_unique').on(t.referrerUserId, t.refereeUserId),
  statusIdx: index('idx_referrals_status').on(t.status),
  codeIdx: index('idx_referrals_code').on(t.referralCode),
}));

// ──────────────────────────────────────────
// burns
// ──────────────────────────────────────────
export const burns = pgTable('burns', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull(),
  txSignature: varchar('tx_signature', { length: 88 }).notNull().unique(),
  burnAmount: numeric('burn_amount', { precision: 20, scale: 6 }).notNull(),
  feeAmount: numeric('fee_amount', { precision: 20, scale: 6 }).notNull().default('0'),
  burnDate: date('burn_date').notNull(),
  streakDay: integer('streak_day').notNull(),
  slot: bigint('slot', { mode: 'number' }).notNull(),
  blockTime: timestamp('block_time', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  verificationError: text('verification_error'),
  badgeEarnedId: varchar('badge_earned_id', { length: 20 }),
  nftMintAddress: varchar('nft_mint_address', { length: 44 }),
  nftTxSignature: varchar('nft_tx_signature', { length: 88 }),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
  clientIp: inet('client_ip'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // txSignature already has UNIQUE constraint (implicit index)
  // Unlimited burns are allowed per wallet per UTC day.
  userIdx: index('idx_burns_user').on(t.userId, t.createdAt),
  statusIdx: index('idx_burns_status').on(t.status),
  dateIdx: index('idx_burns_date').on(t.burnDate),
  walletDateIdx: index('idx_burns_wallet_date_lookup').on(t.walletAddress, t.burnDate),
}));

// ──────────────────────────────────────────
// deposits
// ──────────────────────────────────────────
export const deposits = pgTable('deposits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull(),
  txSignature: varchar('tx_signature', { length: 88 }).notNull().unique(),
  amount: numeric('amount', { precision: 20, scale: 6 }).notNull(),
  slot: bigint('slot', { mode: 'number' }).notNull(),
  blockTime: timestamp('block_time', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  verificationError: text('verification_error'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // txSignature already has UNIQUE constraint (implicit index)
  userIdx: index('idx_deposits_user').on(t.userId, t.createdAt),
}));

// ──────────────────────────────────────────
// badges
// ──────────────────────────────────────────
export const badges = pgTable('badges', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull(),
  badgeId: varchar('badge_id', { length: 20 }).notNull(),
  badgeType: varchar('badge_type', { length: 10 }).notNull(),
  requirementValue: integer('requirement_value').notNull(),
  nftMintAddress: varchar('nft_mint_address', { length: 44 }),
  nftTxSignature: varchar('nft_tx_signature', { length: 88 }),
  nftMintStatus: varchar('nft_mint_status', { length: 20 }).default('PENDING'),
  nftSeedSalt: varchar('nft_seed_salt', { length: 64 }),
  nftMintStartedAt: timestamp('nft_mint_started_at', { withTimezone: true }),
  nftMintFailureReason: text('nft_mint_failure_reason'),
  pendingClaimMint: varchar('pending_claim_mint', { length: 44 }),
  pendingClaimExpiresAt: timestamp('pending_claim_expires_at', { withTimezone: true }),
  earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userBadgeIdx: uniqueIndex('idx_badges_user_badge').on(t.userId, t.badgeId),
  walletIdx: index('idx_badges_wallet').on(t.walletAddress),
  mintStatusIdx: index('idx_badges_mint_status').on(t.nftMintStatus),
}));

// ──────────────────────────────────────────
// perks
// ──────────────────────────────────────────
export const perks = pgTable('perks', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  provider: varchar('provider', { length: 100 }),
  imageUrl: text('image_url'),
  requiredBadgeId: varchar('required_badge_id', { length: 20 }),
  requiredStreak: integer('required_streak'),
  rewardType: varchar('reward_type', { length: 20 }).notNull(),
  totalSupply: integer('total_supply'),
  claimedCount: integer('claimed_count').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  activeIdx: index('idx_perks_active').on(t.isActive),
}));

// ──────────────────────────────────────────
// perk_claims
// ──────────────────────────────────────────
export const perkClaims = pgTable('perk_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  perkId: uuid('perk_id').notNull().references(() => perks.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull(),
  rewardValue: text('reward_value'),
  proofSignature: varchar('proof_signature', { length: 128 }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userPerkIdx: uniqueIndex('idx_perk_claims_user_perk').on(t.userId, t.perkId),
  perkIdx: index('idx_perk_claims_perk').on(t.perkId),
}));

// ──────────────────────────────────────────
// auth_sessions
// ──────────────────────────────────────────
export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  walletIdx: index('idx_sessions_wallet').on(t.walletAddress),
  tokenIdx: index('idx_sessions_token').on(t.tokenHash),
}));

// ──────────────────────────────────────────
// auth_challenges
// ──────────────────────────────────────────
export const authChallenges = pgTable('auth_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull(),
  nonce: varchar('nonce', { length: 64 }).notNull().unique(),
  ipAddress: inet('ip_address'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // nonce already has UNIQUE constraint (implicit index)
  expiresIdx: index('idx_challenges_expires').on(t.expiresAt),
}));

// ──────────────────────────────────────────
// daily_stats
// ──────────────────────────────────────────
export const dailyStats = pgTable('daily_stats', {
  date: date('date').primaryKey(),
  totalBurns: integer('total_burns').notNull().default(0),
  totalBurnAmount: numeric('total_burn_amount', { precision: 20, scale: 6 }).notNull().default('0'),
  totalFeeAmount: numeric('total_fee_amount', { precision: 20, scale: 6 }).notNull().default('0'),
  totalDeposits: integer('total_deposits').notNull().default(0),
  totalDepositAmount: numeric('total_deposit_amount', { precision: 20, scale: 6 }).notNull().default('0'),
  uniqueBurners: integer('unique_burners').notNull().default(0),
  newUsers: integer('new_users').notNull().default(0),
  badgesMinted: integer('badges_minted').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────
// security_logs
// ──────────────────────────────────────────
export const securityLogs = pgTable('security_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  walletAddress: varchar('wallet_address', { length: 44 }),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
  ipAddress: inet('ip_address'),
  details: jsonb('details'),
  severity: varchar('severity', { length: 10 }).notNull().default('INFO'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  typeIdx: index('idx_security_type').on(t.eventType, t.createdAt),
  walletIdx: index('idx_security_wallet').on(t.walletAddress, t.createdAt),
}));

// ──────────────────────────────────────────
// xp_ledger
// ──────────────────────────────────────────
export const xpLedger = pgTable('xp_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  amount: integer('amount').notNull(),
  reason: varchar('reason', { length: 50 }).notNull(),
  refId: varchar('ref_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('idx_xp_ledger_user').on(t.userId, t.createdAt),
}));

// ──────────────────────────────────────────
// daily_challenge_progress
// ──────────────────────────────────────────
export const dailyChallengeProgress = pgTable('daily_challenge_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  challengeDate: date('challenge_date').notNull(),
  challengeId: varchar('challenge_id', { length: 30 }).notNull(),
  completed: boolean('completed').notNull().default(false),
  progressValue: numeric('progress_value', { precision: 20, scale: 6 }).notNull().default('0'),
  xpAwarded: integer('xp_awarded').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueIdx: uniqueIndex('idx_daily_challenge_unique').on(t.userId, t.challengeDate, t.challengeId),
  dateIdx: index('idx_daily_challenge_date').on(t.userId, t.challengeDate),
}));

// ──────────────────────────────────────────
// weekly_challenge_progress
// ──────────────────────────────────────────
export const weeklyChallengeProgress = pgTable('weekly_challenge_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  weekStart: date('week_start').notNull(),
  challengeId: varchar('challenge_id', { length: 30 }).notNull(),
  completed: boolean('completed').notNull().default(false),
  progressValue: numeric('progress_value', { precision: 20, scale: 6 }).notNull().default('0'),
  xpAwarded: integer('xp_awarded').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueIdx: uniqueIndex('idx_weekly_challenge_unique').on(t.userId, t.weekStart, t.challengeId),
  weekIdx: index('idx_weekly_challenge_week').on(t.userId, t.weekStart),
}));

// ──────────────────────────────────────────
// shield_purchases
// ──────────────────────────────────────────
export const shieldPurchases = pgTable('shield_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  walletAddress: varchar('wallet_address', { length: 44 }).notNull(),
  txSignature: varchar('tx_signature', { length: 88 }).notNull().unique(),
  shieldCount: integer('shield_count').notNull(),
  priceLamports: numeric('price_lamports', { precision: 20, scale: 0 }).notNull(),
  priceUsd: numeric('price_usd', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('SOL'),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('idx_shield_purchases_user').on(t.userId, t.createdAt),
  statusIdx: index('idx_shield_purchases_status').on(t.status),
}));

// ──────────────────────────────────────────
// lucky_drops
// ──────────────────────────────────────────
export const luckyDrops = pgTable('lucky_drops', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  burnId: uuid('burn_id').notNull(),
  itemId: varchar('item_id', { length: 40 }).notNull(),
  rarity: varchar('rarity', { length: 20 }).notNull(),
  applied: boolean('applied').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('idx_lucky_drops_user').on(t.userId),
  burnIdx: index('idx_lucky_drops_burn').on(t.burnId),
}));

// ──────────────────────────────────────────
// active_buffs
// ──────────────────────────────────────────
export const activeBuffs = pgTable('active_buffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  buffType: varchar('buff_type', { length: 40 }).notNull(),
  remainingUses: integer('remaining_uses').notNull().default(1),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (t) => ({
  userBuffIdx: index('idx_active_buffs_user').on(t.userId, t.buffType),
}));

// ──────────────────────────────────────────
// user_inventory
// ──────────────────────────────────────────
export const userInventory = pgTable('user_inventory', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  itemId: varchar('item_id', { length: 40 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userItemIdx: uniqueIndex('idx_inventory_user_item').on(t.userId, t.itemId),
}));
