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

    private fun loadPerks() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val perks = api.getPerks()
                _uiState.update { it.copy(isLoading = false, perks = perks) }
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
)
