package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.model.TreasuryStats
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Drives the Treasury screen: vault balance, global stats, mismatch warning.
 */
@HiltViewModel
class TreasuryViewModel @Inject constructor(
    private val api: SeekerBurnApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TreasuryUiState())
    val uiState: StateFlow<TreasuryUiState> = _uiState.asStateFlow()

    init {
        loadTreasury()
    }

    fun refresh() {
        loadTreasury()
    }

    private fun loadTreasury() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            try {
                val stats = api.getTreasuryStats()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        stats = stats,
                        hasMismatch = !stats.treasuryATAVerified,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

data class TreasuryUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val stats: TreasuryStats? = null,
    val hasMismatch: Boolean = false,
)
