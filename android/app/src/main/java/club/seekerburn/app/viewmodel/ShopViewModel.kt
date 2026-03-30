package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.data.local.SessionStore
import club.seekerburn.app.data.solana.SolanaService
import club.seekerburn.app.data.solana.WalletAdapterService
import club.seekerburn.app.model.PriceQuote
import club.seekerburn.app.model.ShieldPack
import club.seekerburn.app.model.ShieldPurchaseRequest
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ShopViewModel @Inject constructor(
    private val api: SeekerBurnApi,
    private val solanaService: SolanaService,
    private val walletAdapterService: WalletAdapterService,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ShopUiState())
    val uiState: StateFlow<ShopUiState> = _uiState.asStateFlow()

    init {
        loadShop()
    }

    fun refresh() = loadShop()

    private fun loadShop() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val shopResp = api.getShieldPacks()
                val balResp = try { api.getShieldBalance() } catch (_: Exception) { null }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        packs = shopResp.packs,
                        maxShields = shopResp.maxShields,
                        currentShields = balResp?.shields ?: 0,
                        priceSource = shopResp.priceSource,
                        priceQuote = shopResp.priceQuote,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun toggleCurrency() {
        _uiState.update {
            it.copy(selectedCurrency = if (it.selectedCurrency == "SOL") "SKR" else "SOL")
        }
    }

    fun purchaseShield(sender: ActivityResultSender, pack: ShieldPack) {
        viewModelScope.launch {
            _uiState.update { it.copy(purchasing = true, purchaseError = null, purchaseSuccess = null) }
            try {
                val wallet = sessionStore.getWalletAddress()
                    ?: throw IllegalStateException("No wallet connected")

                val currency = _uiState.value.selectedCurrency
                val quote = _uiState.value.priceQuote

                // Build the appropriate transaction based on currency
                val txBytes = if (currency == "SKR") {
                    val baseUnits = pack.priceSkrBaseUnits.toLongOrNull()
                        ?: throw IllegalStateException("Invalid SKR price")
                    solanaService.buildSkrShopTransaction(wallet, baseUnits)
                } else {
                    solanaService.buildSolTransferTransaction(wallet, pack.priceLamports)
                }

                val signature = walletAdapterService.signAndSendTransaction(sender, txBytes)

                // Verify purchase on backend with locked price quote
                val result = api.purchaseShield(ShieldPurchaseRequest(
                    signature = signature,
                    packId = pack.id,
                    currency = currency,
                    priceQuote = quote,
                ))
                _uiState.update {
                    it.copy(
                        purchasing = false,
                        currentShields = result.totalShields,
                        purchaseSuccess = "+${result.shieldsAdded} Shields added!",
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(purchasing = false, purchaseError = e.message)
                }
            }
        }
    }

    fun clearPurchaseMessage() {
        _uiState.update { it.copy(purchaseSuccess = null, purchaseError = null) }
    }
}

data class ShopUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val packs: List<ShieldPack> = emptyList(),
    val maxShields: Int = 10,
    val currentShields: Int = 0,
    val selectedCurrency: String = "SOL",
    val purchasing: Boolean = false,
    val purchaseError: String? = null,
    val purchaseSuccess: String? = null,
    val priceSource: String = "fallback",
    val priceQuote: PriceQuote? = null,
)
