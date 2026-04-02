package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.model.Perk
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class PerksListViewModel @Inject constructor(
    private val api: SeekerBurnApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PerksListUiState())
    val uiState: StateFlow<PerksListUiState> = _uiState.asStateFlow()

    init {
        loadPerks()
    }

    fun refresh() = loadPerks()

    fun recoverStreak() {
        viewModelScope.launch {
            _uiState.update { it.copy(recoveringStreak = true) }
            try {
                val result = api.recoverStreak()
                _uiState.update {
                    it.copy(
                        recoveringStreak = false,
                        streakRecoverable = false,
                        streakRecoveryDeadline = null,
                        streakRecoveryGapDays = 0,
                        streakShields = result.shieldsRemaining,
                        recoverySuccess = "Streak recovered! Used ${result.shieldsConsumed} shield(s)",
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(recoveringStreak = false, recoveryError = e.message) }
            }
        }
    }

    fun clearRecoveryMessages() {
        _uiState.update { it.copy(recoverySuccess = null, recoveryError = null) }
    }

    private fun loadPerks() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val perksDeferred = kotlinx.coroutines.async { api.getPerks() }
                val profileDeferred = kotlinx.coroutines.async { try { api.getProfile() } catch (_: Exception) { null } }
                val perks = perksDeferred.await()
                val profile = profileDeferred.await()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        perks = perks,
                        streakRecoverable = profile?.streakRecoverable ?: false,
                        streakRecoveryDeadline = profile?.streakRecoveryDeadline,
                        streakRecoveryGapDays = profile?.streakRecoveryGapDays ?: 0,
                        streakShields = profile?.streakShields ?: 0,
                        currentStreak = profile?.currentStreak ?: 0,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

data class PerksListUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val perks: List<Perk> = emptyList(),
    val streakRecoverable: Boolean = false,
    val streakRecoveryDeadline: String? = null,
    val streakRecoveryGapDays: Int = 0,
    val streakShields: Int = 0,
    val currentStreak: Int = 0,
    val recoveringStreak: Boolean = false,
    val recoverySuccess: String? = null,
    val recoveryError: String? = null,
)
