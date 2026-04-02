package club.seekerburn.app.data.api

import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.model.*

/**
 * Backend API contract for Seeker Burn Club.
 */
interface SeekerBurnApi {
    // Auth
    suspend fun getChallenge(walletAddress: String): AuthChallengeResponse
    suspend fun verifyAuth(request: AuthVerifyRequest): AuthVerifyResponse
    suspend fun logout()

    // Profile
    suspend fun getProfile(): UserProfile

    // Burn
    suspend fun submitBurn(request: BurnSubmitRequest): BurnSubmitResponse
    suspend fun getBurnStatus(signature: String): BurnStatusResponse
    /** Like getBurnStatus but passes ?retryVerify=true to trigger on-chain re-check if not in DB. */
    suspend fun getBurnStatusRetry(signature: String): BurnStatusResponse
    suspend fun hasBurnedToday(): Boolean
    suspend fun getBurnHistory(page: Int = 1, limit: Int = SeekerBurnConfig.DEPOSIT_PAGE_SIZE): List<BurnRecord>

    // Deposit
    suspend fun submitDeposit(signature: String, amount: String): DepositSubmitResponse
    suspend fun getDepositHistory(page: Int = 1, limit: Int = SeekerBurnConfig.DEPOSIT_PAGE_SIZE): List<DepositRecord>

    // Leaderboard
    suspend fun getLeaderboard(type: String, page: Int = 1, limit: Int = SeekerBurnConfig.LEADERBOARD_PAGE_SIZE): LeaderboardResponse

    // Badges
    suspend fun getBadges(): List<BadgeEarned>
    suspend fun prepareBadgeClaim(badgeId: String): BadgeClaimPrepareResponse
    suspend fun confirmBadgeClaim(badgeId: String, request: BadgeClaimConfirmRequest): BadgeClaimConfirmResponse
    suspend fun getClaimStatus(badgeId: String): BadgeClaimStatusResponse

    // Perks
    suspend fun getPerks(): List<Perk>
    suspend fun claimPerk(perkId: String, proofSignature: String): PerkClaimResponse

    // Treasury
    suspend fun getTreasuryStats(): TreasuryStats

    // Global Stats (public — no auth required)
    suspend fun getGlobalStats(): GlobalStats

    // Referrals
    suspend fun getReferralOverview(): ReferralOverview
    suspend fun getReferralHistory(): List<ReferralHistoryItem>
    suspend fun applyReferralCode(code: String): ReferralApplyResponse

    // Challenges
    suspend fun getChallenges(): ChallengesResponse

    // Shield Shop
    suspend fun getShieldPacks(): ShieldShopResponse
    suspend fun purchaseShield(request: ShieldPurchaseRequest): ShieldPurchaseResponse
    suspend fun getShieldBalance(): ShieldBalanceResponse
    suspend fun recoverStreak(): RecoverStreakResponse

    // Lucky Burns
    suspend fun getLuckyInventory(): InventoryResponse
    suspend fun getLuckyHistory(): LuckyDropHistoryResponse
}
