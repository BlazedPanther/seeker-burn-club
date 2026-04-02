package club.seekerburn.app.data.api

import club.seekerburn.app.data.local.SessionStore
import club.seekerburn.app.model.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*
import kotlinx.serialization.Serializable
import javax.inject.Inject

/** Exception indicating the auth token has expired and user must re-authenticate. */
class TokenExpiredException : Exception("Auth token expired")

class SeekerBurnApiImpl @Inject constructor(
    private val client: HttpClient,
    private val sessionStore: SessionStore,
) : SeekerBurnApi {

    /**
     * Get the auth token, throwing [TokenExpiredException] if it has expired.
     * This forces callers (ViewModels) to trigger re-auth instead of getting
     * cryptic 401 errors from the backend.
     */
    private suspend fun requireAuthToken(): String {
        if (sessionStore.isTokenExpired()) {
            sessionStore.clearSession()
            throw TokenExpiredException()
        }
        return sessionStore.getAuthToken() ?: throw TokenExpiredException()
    }

    private suspend fun authToken(): String? = sessionStore.getAuthToken()

    private fun HttpRequestBuilder.bearerAuth(token: String?) {
        token?.let { header(HttpHeaders.Authorization, "Bearer $it") }
    }

    // ── Auth ──

    override suspend fun getChallenge(walletAddress: String): AuthChallengeResponse {
        return client.post("/api/v1/auth/challenge") {
            setBody(mapOf("walletAddress" to walletAddress))
        }.body()
    }

    override suspend fun verifyAuth(request: AuthVerifyRequest): AuthVerifyResponse {
        return client.post("/api/v1/auth/verify") {
            setBody(request)
        }.body()
    }

    override suspend fun logout() {
        val token = authToken()
        client.post("/api/v1/auth/logout") {
            bearerAuth(token)
            // Backend rejects empty JSON bodies when content-type is application/json.
            setBody(emptyMap<String, String>())
        }
    }

    // ── Profile ──

    override suspend fun getProfile(): UserProfile {
        val token = requireAuthToken()
        return client.get("/api/v1/profile") {
            bearerAuth(token)
        }.body()
    }

    // ── Burn ──

    override suspend fun submitBurn(request: BurnSubmitRequest): BurnSubmitResponse {
        val token = requireAuthToken()
        return client.post("/api/v1/burn/submit") {
            bearerAuth(token)
            setBody(request)
        }.body()
    }

    override suspend fun getBurnStatus(signature: String): BurnStatusResponse {
        val token = requireAuthToken()
        return client.get("/api/v1/burn/status/$signature") {
            bearerAuth(token)
        }.body()
    }

    override suspend fun getBurnStatusRetry(signature: String): BurnStatusResponse {
        val token = requireAuthToken()
        val response = client.get("/api/v1/burn/status/$signature") {
            bearerAuth(token)
            parameter("retryVerify", "true")
        }
        // 202 means ON_CHAIN_NOT_RECORDED — parse as BurnStatusResponse with that status
        if (response.status.value == 202) {
            // The backend returns { status: "ON_CHAIN_NOT_RECORDED", signature, message }
            // Map to BurnStatusResponse so the caller can handle it uniformly
            return BurnStatusResponse(
                id = "",
                status = "ON_CHAIN_NOT_RECORDED",
                signature = signature,
            )
        }
        return response.body()
    }

    override suspend fun hasBurnedToday(): Boolean {
        @Serializable data class TodayResponse(val burnedToday: Boolean = false)
        val token = requireAuthToken()
        val response: TodayResponse = client.get("/api/v1/burn/today") {
            bearerAuth(token)
        }.body()
        return response.burnedToday
    }

    override suspend fun getBurnHistory(page: Int, limit: Int): List<BurnRecord> {
        @Serializable data class HistoryResponse(val burns: List<BurnRecord>)
        val token = requireAuthToken()
        val response: HistoryResponse = client.get("/api/v1/burn/history") {
            bearerAuth(token)
            parameter("page", page)
            parameter("limit", limit)
        }.body()
        return response.burns
    }

    // ── Deposit ──

    override suspend fun submitDeposit(signature: String, amount: String): DepositSubmitResponse {
        val token = requireAuthToken()
        return client.post("/api/v1/deposit/submit") {
            bearerAuth(token)
            setBody(mapOf("signature" to signature, "amount" to amount))
        }.body()
    }

    override suspend fun getDepositHistory(page: Int, limit: Int): List<DepositRecord> {
        @Serializable data class HistoryResponse(val deposits: List<DepositRecord>)
        val token = requireAuthToken()
        val response: HistoryResponse = client.get("/api/v1/deposit/history") {
            bearerAuth(token)
            parameter("page", page)
            parameter("limit", limit)
        }.body()
        return response.deposits
    }

    // ── Leaderboard ──

    override suspend fun getLeaderboard(type: String, page: Int, limit: Int): LeaderboardResponse {
        val token = requireAuthToken()
        return client.get("/api/v1/leaderboard/$type") {
            bearerAuth(token)
            parameter("page", page)
            parameter("limit", limit)
        }.body()
    }

    // ── Badges ──

    override suspend fun getBadges(): List<BadgeEarned> {
        val token = requireAuthToken()
        return client.get("/api/v1/badges") {
            bearerAuth(token)
        }.body()
    }

    override suspend fun prepareBadgeClaim(badgeId: String): BadgeClaimPrepareResponse {
        val token = requireAuthToken()
        return client.post("/api/v1/badges/$badgeId/claim/prepare") {
            bearerAuth(token)
            // Send {} explicitly; otherwise Fastify returns 400 (empty JSON body).
            setBody(emptyMap<String, String>())
        }.body()
    }

    override suspend fun confirmBadgeClaim(badgeId: String, request: BadgeClaimConfirmRequest): BadgeClaimConfirmResponse {
        val token = requireAuthToken()
        return client.post("/api/v1/badges/$badgeId/claim/confirm") {
            bearerAuth(token)
            setBody(request)
        }.body()
    }

    override suspend fun getClaimStatus(badgeId: String): BadgeClaimStatusResponse {
        val token = requireAuthToken()
        return client.get("/api/v1/badges/$badgeId/claim/status") {
            bearerAuth(token)
        }.body()
    }

    // ── Perks ──

    override suspend fun getPerks(): List<Perk> {
        val token = requireAuthToken()
        return client.get("/api/v1/perks") {
            bearerAuth(token)
        }.body()
    }

    override suspend fun claimPerk(perkId: String, proofSignature: String): PerkClaimResponse {
        val token = requireAuthToken()
        return client.post("/api/v1/perks/$perkId/claim") {
            bearerAuth(token)
            setBody(mapOf("proofSignature" to proofSignature))
        }.body()
    }

    // ── Treasury ──

    override suspend fun getTreasuryStats(): TreasuryStats {
        // Treasury stats are now public — no auth required
        return client.get("/api/v1/treasury/stats").body()
    }

    // ── Global Stats ──

    override suspend fun getGlobalStats(): GlobalStats {
        // Public endpoint — no auth required
        return client.get("/api/v1/leaderboard/global/stats").body()
    }

    // ── Referrals ──

    override suspend fun getReferralOverview(): ReferralOverview {
        val token = requireAuthToken()
        return client.get("/api/v1/referrals/me") {
            bearerAuth(token)
        }.body()
    }

    override suspend fun getReferralHistory(): List<ReferralHistoryItem> {
        @Serializable data class ReferralHistoryResponse(val history: List<ReferralHistoryItem> = emptyList())
        val token = requireAuthToken()
        val response: ReferralHistoryResponse = client.get("/api/v1/referrals/history") {
            bearerAuth(token)
        }.body()
        return response.history
    }

    override suspend fun applyReferralCode(code: String): ReferralApplyResponse {
        val token = requireAuthToken()
        return client.post("/api/v1/referrals/apply") {
            bearerAuth(token)
            setBody(mapOf("code" to code))
        }.body()
    }

    // ── Challenges ──

    override suspend fun getChallenges(): ChallengesResponse {
        val token = requireAuthToken()
        return client.get("/api/v1/challenges") {
            bearerAuth(token)
        }.body()
    }

    // ── Shield Shop ──

    override suspend fun getShieldPacks(): ShieldShopResponse {
        // Public — no auth needed
        return client.get("/api/v1/shop/shields").body()
    }

    override suspend fun purchaseShield(request: ShieldPurchaseRequest): ShieldPurchaseResponse {
        val token = requireAuthToken()
        return client.post("/api/v1/shop/shields/purchase") {
            bearerAuth(token)
            setBody(request)
        }.body()
    }

    override suspend fun getShieldBalance(): ShieldBalanceResponse {
        val token = requireAuthToken()
        return client.get("/api/v1/shop/shields/balance") {
            bearerAuth(token)
        }.body()
    }

    override suspend fun recoverStreak(): RecoverStreakResponse {
        val token = requireAuthToken()
        return client.post("/api/v1/shields/recover") {
            bearerAuth(token)
        }.body()
    }

    override suspend fun getLuckyInventory(): InventoryResponse {
        val token = requireAuthToken()
        return client.get("/api/v1/lucky/inventory") {
            bearerAuth(token)
        }.body()
    }

    override suspend fun getLuckyHistory(): LuckyDropHistoryResponse {
        val token = requireAuthToken()
        return client.get("/api/v1/lucky/history") {
            bearerAuth(token)
        }.body()
    }
}
