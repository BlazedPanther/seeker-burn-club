package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.model.GlobalStats
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Drives the Global Program Stats section — public data, no auth required.
 */
@HiltViewModel
class GlobalStatsViewModel @Inject constructor(
    private val api: SeekerBurnApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(GlobalStatsUiState())
    val uiState: StateFlow<GlobalStatsUiState> = _uiState.asStateFlow()

    init {
        loadStats()
    }

    fun refresh() {
        loadStats()
    }

    private fun loadStats() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            try {
                val stats = api.getGlobalStats()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        stats = stats,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

data class GlobalStatsUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val stats: GlobalStats? = null,
)
