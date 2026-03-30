package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.model.ChallengeProgress
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ChallengesViewModel @Inject constructor(
    private val api: SeekerBurnApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChallengesUiState())
    val uiState: StateFlow<ChallengesUiState> = _uiState.asStateFlow()

    init {
        loadChallenges()
    }

    fun refresh() = loadChallenges()

    private fun loadChallenges() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val resp = api.getChallenges()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        xp = resp.xp,
                        level = resp.level,
                        levelTitle = resp.levelTitle,
                        xpIntoLevel = resp.xpIntoLevel,
                        xpToNextLevel = resp.xpToNextLevel,
                        dailyChallenges = resp.dailyChallenges,
                        weeklyChallenges = resp.weeklyChallenges,
                        dailySweep = resp.dailySweep,
                        weekStart = resp.weekStart,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

data class ChallengesUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val xp: Long = 0,
    val level: Int = 1,
    val levelTitle: String = "Spark",
    val xpIntoLevel: Int = 0,
    val xpToNextLevel: Int = 500,
    val dailyChallenges: List<ChallengeProgress> = emptyList(),
    val weeklyChallenges: List<ChallengeProgress> = emptyList(),
    val dailySweep: Boolean = false,
    val weekStart: String = "",
)
