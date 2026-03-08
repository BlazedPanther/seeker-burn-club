package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.data.solana.WalletAdapterService
import club.seekerburn.app.model.BadgeClaimConfirmRequest
import club.seekerburn.app.model.BadgeClaimConfirmResponse
import club.seekerburn.app.model.BadgeClaimPrepareResponse
import club.seekerburn.app.model.BadgeDefinition
import club.seekerburn.app.model.BadgeEarned
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Drives the Badges tab: loads user's earned badges and merges with definitions.
 */
@HiltViewModel
class BadgesViewModel @Inject constructor(
    private val api: SeekerBurnApi,
    private val walletAdapterService: WalletAdapterService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BadgesUiState())
    val uiState: StateFlow<BadgesUiState> = _uiState.asStateFlow()

    init {
        loadBadges()
    }

    fun refresh() {
        loadBadges()
    }

    // ── NFT Claim (user-pays) ──

    /** Step 1: Ask backend for the partially-signed NFT mint transaction. */
    suspend fun prepareBadgeClaim(badgeId: String): BadgeClaimPrepareResponse =
        api.prepareBadgeClaim(badgeId)

    /** Step 2: Add user's wallet signature via MWA and broadcast. */
    suspend fun signAndSendTransaction(
        sender: ActivityResultSender,
        txBytes: ByteArray,
    ): String = walletAdapterService.signAndSendTransaction(sender, txBytes)

    /** Step 3: Tell backend the tx is confirmed so it records the mint address. */
    suspend fun confirmBadgeClaim(
        badgeId: String,
        txSignature: String,
        mintPublicKey: String,
    ): BadgeClaimConfirmResponse = api.confirmBadgeClaim(
        badgeId,
        BadgeClaimConfirmRequest(txSignature = txSignature, mintPublicKey = mintPublicKey),
    )

    private fun loadBadges() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            try {
                val earnedBadges = api.getBadges()
                val earnedIds = earnedBadges.map { it.id }.toSet()

                val badgeItems = BadgeDefinition.ALL.map { definition ->
                    val earned = earnedBadges.find { it.id == definition.id }
                    BadgeItem(
                        definition = definition,
                        isEarned = definition.id in earnedIds,
                        earnedAt = earned?.earnedAt,
                        nftMintAddress = earned?.nftMintAddress,
                        nftMintStatus = earned?.nftMintStatus,
                    )
                }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        badges = badgeItems,
                        earnedCount = earnedIds.size,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

data class BadgeItem(
    val definition: BadgeDefinition,
    val isEarned: Boolean,
    val earnedAt: String?,
    val nftMintAddress: String?,
    val nftMintStatus: String?,  // "PENDING" | "COMPLETED" | "FAILED" | null
)

data class BadgesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val badges: List<BadgeItem> = emptyList(),
    val earnedCount: Int = 0,
) {
    val totalCount: Int = BadgeDefinition.ALL.size
}
