package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.model.LeaderboardEntry
import club.seekerburn.app.model.LeaderboardResponse
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Drives the Leaderboard tab: filtered rankings + user rank.
 */
@HiltViewModel
class LeaderboardViewModel @Inject constructor(
    private val api: SeekerBurnApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LeaderboardUiState())
    val uiState: StateFlow<LeaderboardUiState> = _uiState.asStateFlow()

    init {
        loadLeaderboard("streak")
    }

    fun selectFilter(type: String) {
        if (type == _uiState.value.selectedFilter) return
        _uiState.update {
            it.copy(
                selectedFilter = type,
                isLoading = true,
                error = null,
                rankings = emptyList(),
                userRank = null,
            )
        }
        loadLeaderboard(type)
    }

    fun refresh() {
        loadLeaderboard(_uiState.value.selectedFilter)
    }

    private fun loadLeaderboard(type: String) {
        viewModelScope.launch {
            // Clear previous results while switching filters so stale lists
            // are never shown when the new request fails.
            _uiState.update {
                it.copy(
                    isLoading = true,
                    error = null,
                    rankings = emptyList(),
                    userRank = null,
                )
            }

            try {
                val response = api.getLeaderboard(type = type)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        rankings = response.rankings,
                        userRank = response.userRank,
                        hasMore = response.pagination.hasMore,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to load leaderboard",
                        rankings = emptyList(),
                        userRank = null,
                    )
                }
            }
        }
    }
}

data class LeaderboardUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val selectedFilter: String = "streak",
    val rankings: List<LeaderboardEntry> = emptyList(),
    val userRank: LeaderboardEntry? = null,
    val hasMore: Boolean = false,
)
