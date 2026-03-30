package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.data.local.SessionStore
import club.seekerburn.app.data.solana.SolanaService
import club.seekerburn.app.data.solana.WalletAdapterService
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Calendar
import java.util.TimeZone
import javax.inject.Inject

/**
 * Drives the Home tab: user profile, streak, balance, burn state, and preflight checks.
 */
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val api: SeekerBurnApi,
    private val solanaService: SolanaService,
    private val walletAdapterService: WalletAdapterService,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<HomeEvent>()
    val events: SharedFlow<HomeEvent> = _events.asSharedFlow()

    /** Guard against concurrent preflight launches from rapid taps. */
    private var preflightJob: kotlinx.coroutines.Job? = null

    init {
        loadProfile()
    }

    // ── Public actions ──

    fun refresh() {
        loadProfile()
    }

    /**
     * Update the burn amount from user input.
     * Validates against MIN_BURN_SKR and current balance.
     */
    fun setBurnAmount(amount: Double) {
        val clamped = amount.coerceAtLeast(0.0)
        _uiState.update { state ->
            val fee = clamped * SeekerBurnConfig.PLATFORM_FEE_PERCENT / 100.0
            val totalRequired = clamped + fee
            state.copy(
                burnAmount = clamped,
                insufficientBalance = state.skrBalance < totalRequired,
            )
        }
    }

    /**
     * Run preflight checks before showing BurnConfirmScreen.
     * Checks: balance, SOL for fees, treasury ATA.
     */
    fun preflightBurn() {
        // Cancel any existing preflight to prevent concurrent launches from rapid taps
        preflightJob?.cancel()
        preflightJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            try {
                val walletAddress = sessionStore.getWalletAddress()
                    ?: throw IllegalStateException("No wallet connected")

                // 1. Check SKR balance against user-chosen amount
                val skrBalance = solanaService.fetchSkrBalance(walletAddress)
                val chosenAmount = _uiState.value.burnAmount
                val fee = chosenAmount * SeekerBurnConfig.PLATFORM_FEE_PERCENT / 100.0
                val totalRequired = chosenAmount + fee
                if (chosenAmount < SeekerBurnConfig.MIN_BURN_SKR) {
                    _events.emit(HomeEvent.Error("Minimum burn is ${SeekerBurnConfig.MIN_BURN_SKR} SKR"))
                    _uiState.update { it.copy(isLoading = false) }
                    return@launch
                }
                if (skrBalance < totalRequired) {
                    _uiState.update { it.copy(insufficientBalance = true, isLoading = false) }
                    return@launch
                }

                // 2. Check SOL for tx fees
                val solBalance = solanaService.fetchSolBalance(walletAddress)
                if (solBalance < SeekerBurnConfig.MIN_SOL_FOR_TX_FEE_LAMPORTS) {
                    _uiState.update { it.copy(insufficientSol = true, isLoading = false) }
                    return@launch
                }

                // 3. Verify treasury ATA
                val treasuryCheck = solanaService.verifyTreasuryATA()
                if (!treasuryCheck.allPassed) {
                    _events.emit(HomeEvent.TreasuryVerificationFailed)
                    _uiState.update { it.copy(isLoading = false) }
                    return@launch
                }

                _uiState.update { it.copy(isLoading = false) }
                _events.emit(HomeEvent.PreflightPassed)
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
                _events.emit(HomeEvent.Error(e.message ?: "Preflight check failed"))
            }
        }
    }

    /**
     * Build the burn transaction bytes for wallet signing.
     */
    suspend fun buildBurnTransaction(): ByteArray {
        val walletAddress = sessionStore.getWalletAddress()
            ?: throw IllegalStateException("No wallet connected")

        val decimals = solanaService.fetchMintDecimals()
        val multiplier = BigDecimal.TEN.pow(decimals)

        val burnDec = BigDecimal.valueOf(_uiState.value.burnAmount)
        val burnBaseUnits = burnDec.multiply(multiplier).setScale(0, RoundingMode.FLOOR).toLong()
        val feeBaseUnits = burnDec.multiply(BigDecimal.valueOf(SeekerBurnConfig.PLATFORM_FEE_PERCENT))
            .divide(BigDecimal("100"), 20, RoundingMode.FLOOR)
            .multiply(multiplier).setScale(0, RoundingMode.FLOOR).toLong()

        return solanaService.buildBurnTransaction(
            walletAddress = walletAddress,
            burnAmountBaseUnits = burnBaseUnits,
            feeAmountBaseUnits = feeBaseUnits,
        )
    }

    suspend fun signAndSendTransaction(sender: ActivityResultSender, serializedTransaction: ByteArray): String {
        return walletAdapterService.signAndSendTransaction(sender, serializedTransaction)
    }

    /**
     * Submit a signed burn signature to the backend for verification.
     * Returns the response so callers can extract newStreak, badgesEarned, etc.
     */
    suspend fun submitBurn(signature: String): club.seekerburn.app.model.BurnSubmitResponse {
        val burnDec = BigDecimal.valueOf(_uiState.value.burnAmount)
        val feeDec = burnDec.multiply(BigDecimal.valueOf(SeekerBurnConfig.PLATFORM_FEE_PERCENT))
            .divide(BigDecimal("100"), 20, RoundingMode.FLOOR)
            .stripTrailingZeros()

        return api.submitBurn(
            club.seekerburn.app.model.BurnSubmitRequest(
                signature = signature,
                burnAmount = burnDec.toPlainString(),
                feeAmount = feeDec.toPlainString(),
                clientTimestamp = System.currentTimeMillis().toString(),
            )
        )
    }

    /**
     * Immediately reflects a successful burn in the UI state, then triggers
     * a background profile refresh to pull authoritative server data
     * (badges, rank, etc.) without blocking navigation.
     */
    fun refreshAfterBurn(
        newStreak: Int,
        longestStreak: Int?,
        lifetimeBurned: String?,
        badgesEarned: Int,
        earnedBadgeIds: Set<String> = emptySet(),
        xpEarned: Int? = null,
        totalXp: Long? = null,
        level: Int? = null,
        levelTitle: String? = null,
        leveledUp: Boolean? = null,
        shieldsAwarded: Int? = null,
    ) {
        _uiState.update {
            it.copy(
                currentStreak = newStreak,
                longestStreak = maxOf(it.longestStreak, longestStreak ?: newStreak),
                lifetimeBurned = lifetimeBurned?.toDoubleOrNull() ?: (it.lifetimeBurned + it.burnAmount),
                hasBurnedToday = true,
                streakBroken = false,
                previousStreak = 0,
                badgesEarned = it.badgesEarned + badgesEarned,
                earnedBadgeIds = it.earnedBadgeIds + earnedBadgeIds,
                xp = totalXp ?: it.xp,
                level = level ?: it.level,
                levelTitle = levelTitle ?: it.levelTitle,
                streakShields = it.streakShields + (shieldsAwarded ?: 0),
                lastXpGain = xpEarned ?: 0,
                lastLevelUp = leveledUp == true,
            )
        }
        // Background refresh for authoritative data after a short delay
        viewModelScope.launch {
            kotlinx.coroutines.delay(SeekerBurnConfig.POST_BURN_REFRESH_DELAY_MS)
            loadProfile()
        }
    }

    // ── Internal ──

    private fun loadProfile() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            try {
                val walletAddress = sessionStore.getWalletAddress()
                if (walletAddress == null) {
                    _uiState.update { it.copy(isLoading = false) }
                    return@launch
                }

                // Parallel fetch: profile + SKR balance + SOL balance
                val profileDeferred = async { try { api.getProfile() } catch (_: Exception) { null } }
                val skrBalanceDeferred = async { runCatching { solanaService.fetchSkrBalance(walletAddress) } }
                val solBalanceDeferred = async { try { solanaService.fetchSolBalance(walletAddress) } catch (_: Exception) { 0L } }

                val profile = profileDeferred.await()
                val skrBalanceResult = skrBalanceDeferred.await()
                val skrBalance = skrBalanceResult.getOrDefault(0.0)
                val skrBalanceError = skrBalanceResult.exceptionOrNull()?.message
                val solBalance = solBalanceDeferred.await()

                _uiState.update { state ->
                    val currentBurnAmount = state.burnAmount
                    val fee = currentBurnAmount * SeekerBurnConfig.PLATFORM_FEE_PERCENT / 100.0
                    val totalRequired = currentBurnAmount + fee
                    state.copy(
                        isLoading = false,
                        profileLoaded = profile != null,
                        walletAddress = walletAddress,
                        error = skrBalanceError,
                        currentStreak = profile?.currentStreak ?: 0,
                        longestStreak = profile?.longestStreak ?: 0,
                        streakBroken = profile?.streakBroken ?: false,
                        previousStreak = profile?.previousStreak ?: 0,
                        lifetimeBurned = profile?.lifetimeBurnedDouble ?: 0.0,
                        badgesEarned = profile?.badges?.size ?: 0,
                        earnedBadgeIds = profile?.badges?.map { it.id }?.toSet() ?: emptySet(),
                        mintedBadgeIds = profile?.badges?.filter { it.nftMintStatus == "COMPLETED" }?.map { it.id }?.toSet() ?: emptySet(),
                        hasBurnedToday = profile?.todayBurned ?: false,
                        streakShieldActive = profile?.streakShieldActive ?: false,
                        streakShields = profile?.streakShields ?: 0,
                        xp = profile?.xp ?: 0,
                        level = profile?.level ?: 1,
                        levelTitle = profile?.levelTitle ?: "Spark",
                        xpIntoLevel = profile?.xpIntoLevel ?: 0,
                        xpToNextLevel = profile?.xpToNextLevel ?: 500,
                        weeklyBurnSKR = profile?.weeklyBurnSKR?.toDoubleOrNull() ?: 0.0,
                        weeklyBurnDays = profile?.weeklyBurnDays ?: 0,
                        dailyBurnSKR = profile?.dailyBurnSKR?.toDoubleOrNull() ?: 0.0,
                        totalBurnCount = profile?.totalBurnCount ?: 0,
                        perfectMonths = profile?.perfectMonths ?: 0,
                        skrBalance = skrBalance,
                        solBalance = solBalance,
                        insufficientBalance = if (skrBalanceError == null) skrBalance < totalRequired else false,
                        insufficientSol = solBalance < SeekerBurnConfig.MIN_SOL_FOR_TX_FEE_LAMPORTS,
                        nextMilestone = computeNextMilestone(
                            profile?.currentStreak ?: 0,
                            profile?.badges?.map { it.id }?.toSet() ?: emptySet(),
                        ),
                        isStreakAtRisk = computeStreakAtRisk(
                            hasBurnedToday = profile?.todayBurned ?: false,
                            currentStreak = profile?.currentStreak ?: 0,
                        ),
                        // Clear one-shot burn feedback banners on profile refresh
                        lastXpGain = 0,
                        lastLevelUp = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    private fun computeNextMilestone(currentStreak: Int, earnedBadgeIds: Set<String> = emptySet()): Int {
        val milestones = SeekerBurnConfig.STREAK_MILESTONES
        // Skip milestones the user already earned — target the next unearned one.
        return milestones.firstOrNull { it > currentStreak && "STREAK_$it" !in earnedBadgeIds }
            ?: milestones.last()
    }

    /**
     * Streak is "at risk" when user has an active streak (≥1), hasn't burned today,
     * and it's past 22:00 UTC (late-night warning before midnight reset).
     */
    private fun computeStreakAtRisk(hasBurnedToday: Boolean, currentStreak: Int): Boolean {
        if (hasBurnedToday || currentStreak < 1) return false
        val utcHour = Calendar.getInstance(TimeZone.getTimeZone("UTC")).get(Calendar.HOUR_OF_DAY)
        return utcHour >= SeekerBurnConfig.STREAK_AT_RISK_UTC_HOUR
    }

    override fun onCleared() {
        super.onCleared()
        preflightJob?.cancel()
    }
}

// ── UI State ──

data class HomeUiState(
    val isLoading: Boolean = true,
    val profileLoaded: Boolean = false,
    val error: String? = null,
    val walletAddress: String = "",
    val currentStreak: Int = 0,
    val longestStreak: Int = 0,
    val streakBroken: Boolean = false,
    val previousStreak: Int = 0,
    val lifetimeBurned: Double = 0.0,
    val badgesEarned: Int = 0,
    val earnedBadgeIds: Set<String> = emptySet(),
    val mintedBadgeIds: Set<String> = emptySet(),
    val hasBurnedToday: Boolean = false,
    val streakShieldActive: Boolean = false,
    val streakShields: Int = 0,
    val xp: Long = 0,
    val level: Int = 1,
    val levelTitle: String = "Spark",
    val xpIntoLevel: Int = 0,
    val xpToNextLevel: Int = 500,
    val weeklyBurnSKR: Double = 0.0,
    val weeklyBurnDays: Int = 0,
    val dailyBurnSKR: Double = 0.0,
    val totalBurnCount: Int = 0,
    val perfectMonths: Int = 0,
    val skrBalance: Double = 0.0,
    val solBalance: Long = 0L,
    val burnAmount: Double = SeekerBurnConfig.MIN_BURN_SKR,
    val insufficientBalance: Boolean = false,
    val insufficientSol: Boolean = false,
    val nextMilestone: Int = 3,
    val isStreakAtRisk: Boolean = false,
    val lastXpGain: Int = 0,
    val lastLevelUp: Boolean = false,
) {
    /** 1% of burn amount — computed so it always matches the actual on-chain fee. */
    val feeAmount: Double get() = burnAmount * SeekerBurnConfig.PLATFORM_FEE_PERCENT / 100.0
    val canBurn: Boolean get() = walletAddress.isNotBlank() && !isLoading && !insufficientBalance && !insufficientSol && burnAmount >= SeekerBurnConfig.MIN_BURN_SKR
}

// ── Events (one-shot navigation / toasts) ──

sealed class HomeEvent {
    data object PreflightPassed : HomeEvent()
    data object AlreadyBurnedToday : HomeEvent()
    data object TreasuryVerificationFailed : HomeEvent()
    data class Error(val message: String) : HomeEvent()
}
