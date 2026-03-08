package club.seekerburn.app.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.model.Perk
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Drives the Perk Detail screen — loads a single perk by ID from the cached perk list.
 */
@HiltViewModel
class PerkDetailViewModel @Inject constructor(
    private val api: SeekerBurnApi,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val perkId: String = savedStateHandle["perkId"] ?: ""

    private val _uiState = MutableStateFlow(PerkDetailUiState())
    val uiState: StateFlow<PerkDetailUiState> = _uiState.asStateFlow()

    init {
        if (perkId.isNotBlank()) {
            loadPerk()
        }
    }

    fun refresh() {
        loadPerk()
    }

    fun claimPerk(proofSignature: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isClaiming = true, error = null) }
            try {
                api.claimPerk(perkId, proofSignature)
                // Reload the perk to get updated state (userClaimed = true)
                loadPerk()
            } catch (e: Exception) {
                _uiState.update { it.copy(isClaiming = false, error = e.message) }
            }
        }
    }

    private fun loadPerk() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val perks = api.getPerks()
                val perk = perks.find { it.id == perkId }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        perk = perk,
                        notFound = perk == null,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}

data class PerkDetailUiState(
    val isLoading: Boolean = true,
    val isClaiming: Boolean = false,
    val error: String? = null,
    val perk: Perk? = null,
    val notFound: Boolean = false,
)
