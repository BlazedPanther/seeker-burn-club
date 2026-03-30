package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.model.ActiveBuff
import club.seekerburn.app.model.InventoryItem
import club.seekerburn.app.model.LuckyDropHistoryItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class InventoryUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val inventory: List<InventoryItem> = emptyList(),
    val activeBuffs: List<ActiveBuff> = emptyList(),
    val recentDrops: List<LuckyDropHistoryItem> = emptyList(),
)

@HiltViewModel
class InventoryViewModel @Inject constructor(
    private val api: SeekerBurnApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(InventoryUiState())
    val uiState: StateFlow<InventoryUiState> = _uiState.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            try {
                val inventoryResp = api.getLuckyInventory()
                val historyResp = api.getLuckyHistory()
                _uiState.update {
                    it.copy(
                        loading = false,
                        inventory = inventoryResp.inventory,
                        activeBuffs = inventoryResp.activeBuffs,
                        recentDrops = historyResp.drops,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(loading = false, error = e.message) }
            }
        }
    }
}
