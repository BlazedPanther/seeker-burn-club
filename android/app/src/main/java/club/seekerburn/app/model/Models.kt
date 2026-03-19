package club.seekerburn.app.model

import club.seekerburn.app.R
import club.seekerburn.app.util.FormatUtils
import kotlinx.serialization.Serializable

// ──────────────────────────────────────────
// User & Profile
// ──────────────────────────────────────────

@Serializable
data class UserProfile(
    val walletAddress: String,
    val currentStreak: Int = 0,
    val longestStreak: Int = 0,
    val streakBroken: Boolean = false,
    val previousStreak: Int = 0,
    val lifetimeBurned: String = "0.000000",  // NUMERIC string from backend
    val totalDeposited: String = "0.000000",
    val streakShieldActive: Boolean = false,
    val todayBurned: Boolean = false,
    val todayBurnSignature: String? = null,
    val lastBurnAt: String? = null,
    val weeklyBurnSKR: String = "0",
    val weeklyBurnDays: Int = 0,
    val dailyBurnSKR: String = "0",
    val dailyBurnCount: Int = 0,
    val totalBurnCount: Int = 0,
    val perfectMonths: Int = 0,
    val badges: List<BadgeEarned> = emptyList(),
    val rank: UserRank? = null,
    val joinedAt: String? = null,
) {
    val lifetimeBurnedDouble: Double get() = lifetimeBurned.toDoubleOrNull() ?: 0.0
    val totalDepositedDouble: Double get() = totalDeposited.toDoubleOrNull() ?: 0.0
    val truncatedAddress: String get() = FormatUtils.truncateAddress(walletAddress)
}

@Serializable
data class UserRank(
    val streak: Int? = null,
    val lifetime: Int? = null,
    val badges: Int? = null,
)

// ──────────────────────────────────────────
// Burn
// ──────────────────────────────────────────

@Serializable
data class BurnRecord(
    val id: String,
    val signature: String,
    val burnAmount: String,
    val feeAmount: String? = null,
    val streakDay: Int = 0,
    val status: String = "PENDING",
    val createdAt: String,
    val badgeEarned: BadgeEarnedFromBurn? = null,
)

@Serializable
data class BurnSubmitRequest(
    val signature: String,
    val burnAmount: String,
    val feeAmount: String,
    val clientTimestamp: String,
)

@Serializable
data class BurnSubmitResponse(
    val id: String,
    val status: String,
    val signature: String,
    val newStreak: Int? = null,
    val longestStreak: Int? = null,
    val lifetimeBurned: String? = null,
    val badgesEarned: List<BadgeEarnedFromBurn>? = null,
    val submittedAt: String,
)

@Serializable
data class BurnStatusResponse(
    val id: String,
    val status: String,
    val signature: String,
    val burnAmount: String? = null,
    val feeAmount: String? = null,
    val slot: Long? = null,
    val blockTime: Long? = null,
    val newStreak: Int? = null,
    val lifetimeBurned: String? = null,
    val badgeEarned: BadgeEarnedFromBurn? = null,
    val verifiedAt: String? = null,
)

@Serializable
data class BadgeEarnedFromBurn(
    val id: String,
    val name: String = "",
    val nftMintAddress: String? = null,
    val nftTxSignature: String? = null,
)

// ──────────────────────────────────────────
// Badges
// ──────────────────────────────────────────

enum class BadgeType { STREAK, LIFETIME, DAILY, TXCOUNT, PERFECT }

@Serializable
data class BadgeEarned(
    val id: String,
    val name: String,
    val description: String = "",
    val emoji: String = "🔥",
    val type: String = "streak",
    val earnedAt: String? = null,
    val nftMintAddress: String? = null,
    val nftMintStatus: String? = null,
    val nftTxSignature: String? = null,
)

// NFT self-mint claim flow
@Serializable
data class BadgeClaimPrepareResponse(
    /** Base64-encoded partially-signed transaction. User signs as fee payer via MWA. */
    val serializedTx: String,
    val mintPublicKey: String,
)

@Serializable
data class BadgeClaimConfirmRequest(
    val txSignature: String,
    val mintPublicKey: String,
)

@Serializable
data class BadgeClaimConfirmResponse(
    val success: Boolean,
    val nftMintAddress: String? = null,
    val status: String? = null,
)

@Serializable
data class BadgeClaimStatusResponse(
    val status: String,
    val nftMintAddress: String? = null,
    val reason: String? = null,
    val nftTxSignature: String? = null,
)

data class BadgeDefinition(
    val id: String,
    val name: String,
    val description: String,
    val type: BadgeType,
    val requirementValue: Int,
    @androidx.annotation.DrawableRes val iconRes: Int,
) {
    companion object {
        val ALL = listOf(
            // ── Streak badges (14 total) ───────────────────────
            BadgeDefinition("STREAK_1",    "First Flame",   "Burn for 1 day",                   BadgeType.STREAK,   1,    R.drawable.ic_flame),
            BadgeDefinition("STREAK_3",    "Kindling",       "3-day burn streak",                 BadgeType.STREAK,   3,    R.drawable.ic_flame),
            BadgeDefinition("STREAK_7",    "Torch Bearer",   "7-day burn streak",                 BadgeType.STREAK,   7,    R.drawable.ic_flame),
            BadgeDefinition("STREAK_14",   "Furnace",        "14-day burn streak",                BadgeType.STREAK,   14,   R.drawable.ic_flame),
            BadgeDefinition("STREAK_21",   "Forge",          "21-day burn streak",                BadgeType.STREAK,   21,   R.drawable.ic_flame),
            BadgeDefinition("STREAK_30",   "Inferno",        "30-day burn streak",                BadgeType.STREAK,   30,   R.drawable.ic_flame),
            BadgeDefinition("STREAK_60",   "Blaze Master",   "60-day burn streak",                BadgeType.STREAK,   60,   R.drawable.ic_flame),
            BadgeDefinition("STREAK_90",   "Eternal Flame",  "90-day burn streak",                BadgeType.STREAK,   90,   R.drawable.ic_flame),
            BadgeDefinition("STREAK_180",  "Hellfire",       "180-day burn streak",               BadgeType.STREAK,   180,  R.drawable.ic_flame),
            BadgeDefinition("STREAK_365",  "Phoenix",        "365-day burn streak",               BadgeType.STREAK,   365,  R.drawable.ic_flame),
            BadgeDefinition("STREAK_500",  "Demon Lord",     "500-day burn streak",               BadgeType.STREAK,   500,  R.drawable.ic_flame),
            BadgeDefinition("STREAK_730",  "Archfiend",      "730-day (2-year) burn streak",      BadgeType.STREAK,   730,  R.drawable.ic_flame),
            BadgeDefinition("STREAK_1000", "Immortal",       "1,000-day burn streak",             BadgeType.STREAK,   1000, R.drawable.ic_flame),
            BadgeDefinition("STREAK_1500", "Eternal",        "1,500-day (4-year) burn streak",    BadgeType.STREAK,   1500, R.drawable.ic_flame),
            // ── Lifetime burn badges (14 total) ────────────────
            // SKR price ~$0.021 → thresholds tuned to real USD value
            BadgeDefinition("BURN_10",      "Ember",          "Burn 10 SKR (~$0.21)",              BadgeType.LIFETIME, 10,      R.drawable.ic_gem),
            BadgeDefinition("BURN_50",      "Blaze",          "Burn 50 SKR (~$1)",                 BadgeType.LIFETIME, 50,      R.drawable.ic_gem),
            BadgeDefinition("BURN_100",     "Wildfire",       "Burn 100 SKR (~$2)",                BadgeType.LIFETIME, 100,     R.drawable.ic_gem),
            BadgeDefinition("BURN_500",     "Supernova",      "Burn 500 SKR (~$10)",               BadgeType.LIFETIME, 500,     R.drawable.ic_gem),
            BadgeDefinition("BURN_1000",    "Singularity",    "Burn 1,000 SKR (~$21)",             BadgeType.LIFETIME, 1000,    R.drawable.ic_gem),
            BadgeDefinition("BURN_2500",    "Devourer",       "Burn 2,500 SKR (~$53)",             BadgeType.LIFETIME, 2500,    R.drawable.ic_gem),
            BadgeDefinition("BURN_5000",    "Destroyer",      "Burn 5,000 SKR (~$106)",            BadgeType.LIFETIME, 5000,    R.drawable.ic_gem),
            BadgeDefinition("BURN_10000",   "Annihilator",    "Burn 10,000 SKR (~$213)",           BadgeType.LIFETIME, 10000,   R.drawable.ic_gem),
            BadgeDefinition("BURN_25000",   "Titan",          "Burn 25,000 SKR (~$530)",           BadgeType.LIFETIME, 25000,   R.drawable.ic_gem),
            BadgeDefinition("BURN_50000",   "Leviathan",      "Burn 50,000 SKR (~$1,000)",         BadgeType.LIFETIME, 50000,   R.drawable.ic_gem),
            BadgeDefinition("BURN_100000",  "God of Ashes",   "Burn 100,000 SKR (~$2,100)",        BadgeType.LIFETIME, 100000,  R.drawable.ic_gem),
            BadgeDefinition("BURN_250000",  "World Breaker",  "Burn 250,000 SKR (~$5,300)",        BadgeType.LIFETIME, 250000,  R.drawable.ic_gem),
            BadgeDefinition("BURN_500000",  "Oblivion",       "Burn 500,000 SKR (~$10,600)",       BadgeType.LIFETIME, 500000,  R.drawable.ic_gem),
            BadgeDefinition("BURN_1000000", "The Absolute",   "Burn 1,000,000 SKR (~$21,000)",     BadgeType.LIFETIME, 1000000, R.drawable.ic_gem),
            // ── Daily volume badges (5 total) ─────────────────
            BadgeDefinition("DAILY_25",     "Hot Hands",      "Burn 25 SKR in one day (~$0.60)",   BadgeType.DAILY,    25,      R.drawable.ic_flame),
            BadgeDefinition("DAILY_100",    "Firestarter",    "Burn 100 SKR in one day (~$2.40)",  BadgeType.DAILY,    100,     R.drawable.ic_flame),
            BadgeDefinition("DAILY_500",    "Pyromaniac",     "Burn 500 SKR in one day (~$12)",    BadgeType.DAILY,    500,     R.drawable.ic_flame),
            BadgeDefinition("DAILY_2500",   "Eruption",       "Burn 2,500 SKR in one day (~$60)",  BadgeType.DAILY,    2500,    R.drawable.ic_flame),
            BadgeDefinition("DAILY_10000",  "Cataclysm",      "Burn 10,000 SKR in one day (~$240)",BadgeType.DAILY,    10000,   R.drawable.ic_flame),
            // ── Total burn count badges (5 total) ─────────────
            BadgeDefinition("TXCOUNT_10",   "Spark Plug",     "Complete 10 burns",                 BadgeType.TXCOUNT,  10,      R.drawable.ic_gem),
            BadgeDefinition("TXCOUNT_50",   "Fire Hydrant",   "Complete 50 burns",                 BadgeType.TXCOUNT,  50,      R.drawable.ic_gem),
            BadgeDefinition("TXCOUNT_100",  "Burn Machine",   "Complete 100 burns",                BadgeType.TXCOUNT,  100,     R.drawable.ic_gem),
            BadgeDefinition("TXCOUNT_500",  "Incinerator",    "Complete 500 burns",                BadgeType.TXCOUNT,  500,     R.drawable.ic_gem),
            BadgeDefinition("TXCOUNT_1000", "Crematorium",    "Complete 1,000 burns",              BadgeType.TXCOUNT,  1000,    R.drawable.ic_gem),
            // ── Perfect month badges (4 total) ────────────────
            BadgeDefinition("PERFECT_1",    "Flawless",       "Complete 1 perfect month",          BadgeType.PERFECT,  1,       R.drawable.ic_gem),
            BadgeDefinition("PERFECT_3",    "Disciplined",    "Complete 3 perfect months",         BadgeType.PERFECT,  3,       R.drawable.ic_gem),
            BadgeDefinition("PERFECT_6",    "Relentless",     "Complete 6 perfect months",         BadgeType.PERFECT,  6,       R.drawable.ic_gem),
            BadgeDefinition("PERFECT_12",   "Unbreakable",    "Complete 12 perfect months",        BadgeType.PERFECT,  12,      R.drawable.ic_gem),
        )

        fun byId(id: String): BadgeDefinition? = ALL.find { it.id == id }
    }
}

// ──────────────────────────────────────────
// Leaderboard
// ──────────────────────────────────────────

@Serializable
data class LeaderboardEntry(
    val rank: Int,
    val walletAddress: String,
    val value: Double,
    val displayValue: String,
    val profileTitle: String? = null,
) {
    val truncatedAddress: String get() = FormatUtils.truncateAddress(walletAddress)
}

@Serializable
data class LeaderboardResponse(
    val rankings: List<LeaderboardEntry>,
    val userRank: LeaderboardEntry? = null,
    val pagination: Pagination,
)

@Serializable
data class Pagination(
    val page: Int,
    val limit: Int,
    val total: Int = 0,
    val hasMore: Boolean = false,
)

// ──────────────────────────────────────────
// Deposit
// ──────────────────────────────────────────

@Serializable
data class DepositRecord(
    val id: String,
    val signature: String,
    val amount: String,
    val status: String = "PENDING",
    val createdAt: String,
)

@Serializable
data class DepositSubmitResponse(
    val id: String,
    val status: String,
    val signature: String,
    val amount: String,
    val submittedAt: String,
)

// ──────────────────────────────────────────
// Perks
// ──────────────────────────────────────────

@Serializable
data class Perk(
    val id: String,
    val name: String,
    val description: String,
    val provider: String? = null,
    val imageUrl: String? = null,
    val requiredBadgeId: String? = null,
    val requiredStreak: Int? = null,
    val rewardType: String,
    val totalSupply: Int? = null,
    val claimedCount: Int = 0,
    val userClaimed: Boolean = false,
    val userEligible: Boolean = false,
    val streakShieldActive: Boolean? = null,
)

@Serializable
data class PerkClaimResponse(
    val perkId: String,
    val claimed: Boolean,
    val claimedAt: String,
)

// ──────────────────────────────────────────
// Treasury
// ──────────────────────────────────────────

@Serializable
data class TreasuryStats(
    val vaultBalance: String,
    val totalBurnedAllUsers: String,
    val totalDeposited: String,
    val totalMembers: Int,
    val burnsToday: Int,
    val treasuryATA: String,
    val treasuryATAVerified: Boolean,
    val lastUpdated: String,
) {
    val vaultBalanceDouble: Double get() = vaultBalance.toDoubleOrNull() ?: 0.0
    val totalBurnedDouble: Double get() = totalBurnedAllUsers.toDoubleOrNull() ?: 0.0
}

// ──────────────────────────────────────────
// Auth
// ──────────────────────────────────────────

@Serializable
data class AuthChallengeResponse(
    val nonce: String,
    val message: String,
    val expiresAt: String,
)

@Serializable
data class AuthVerifyRequest(
    val walletAddress: String,
    val signature: String,
    val nonce: String,
    val deviceFingerprint: String,
)

@Serializable
data class AuthVerifyResponse(
    val token: String,
    val expiresAt: String,
    val user: UserProfile,
)

// ──────────────────────────────────────────
// Global Program Stats (public, no auth)
// ──────────────────────────────────────────

@Serializable
data class GlobalStats(
    val totalSkrBurned: String = "0",
    val totalBurnTransactions: Int = 0,
    val uniqueBurners: Int = 0,
    val totalSkrDeposited: String = "0",
    val totalDepositTransactions: Int = 0,
    val totalMembers: Int = 0,
    val burnsToday: Int = 0,
    val burnedTodayAmount: String = "0",
    val uniqueBurnersToday: Int = 0,
    val highestActiveStreak: Int = 0,
    val highestEverStreak: Int = 0,
    val avgActiveStreak: Double = 0.0,
    val totalBadgesEarned: Int = 0,
    val topBurners: List<TopBurner> = emptyList(),
    val lastUpdated: String = "",
) {
    val totalSkrBurnedDouble: Double get() = totalSkrBurned.toDoubleOrNull() ?: 0.0
    val totalSkrDepositedDouble: Double get() = totalSkrDeposited.toDoubleOrNull() ?: 0.0
    val burnedTodayAmountDouble: Double get() = burnedTodayAmount.toDoubleOrNull() ?: 0.0
}

@Serializable
data class TopBurner(
    val rank: Int,
    val walletAddress: String,
    val lifetimeBurned: String = "0",
    val currentStreak: Int = 0,
    val badgeCount: Int = 0,
) {
    val truncatedAddress: String get() = FormatUtils.truncateAddress(walletAddress)
    val lifetimeBurnedDouble: Double get() = lifetimeBurned.toDoubleOrNull() ?: 0.0
}

// ──────────────────────────────────────────
// Referrals
// ──────────────────────────────────────────

@Serializable
data class ReferralOverview(
    val referralCode: String,
    val canApplyReferral: Boolean,
    val referredBy: ReferredByInfo? = null,
    val stats: ReferralStats,
)

@Serializable
data class ReferredByInfo(
    val walletAddress: String,
    val referralCode: String? = null,
    val appliedAt: String? = null,
)

@Serializable
data class ReferralStats(
    val invited: Int = 0,
    val qualified: Int = 0,
    val pending: Int = 0,
    val rejected: Int = 0,
)

@Serializable
data class ReferralApplyResponse(
    val success: Boolean = false,
    val status: String,
    val referrerWallet: String,
)

@Serializable
data class ReferralHistoryItem(
    val id: String,
    val refereeWallet: String,
    val status: String,
    val rejectionReason: String? = null,
    val createdAt: String,
    val qualifiedAt: String? = null,
) {
    val truncatedRefereeWallet: String get() = FormatUtils.truncateAddress(refereeWallet)
}
