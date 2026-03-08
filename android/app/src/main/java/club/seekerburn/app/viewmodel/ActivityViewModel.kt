package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.data.api.SeekerBurnApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class ActivityViewModel @Inject constructor(
    private val api: SeekerBurnApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ActivityUiState())
    val uiState: StateFlow<ActivityUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                supervisorScope {
                    val burnsDeferred = async { api.getBurnHistory(page = 1, limit = SeekerBurnConfig.ACTIVITY_PAGE_SIZE) }
                    val depositsDeferred = async { api.getDepositHistory(page = 1, limit = SeekerBurnConfig.ACTIVITY_PAGE_SIZE) }

                    val burns = burnsDeferred.await().map {
                        ActivityItemUi(
                            dateLabel = toDateLabel(it.createdAt),
                            title = "Burned ${it.burnAmount} SKR",
                            signature = it.signature,
                            type = ActivityTypeUi.BURN,
                            createdAt = it.createdAt,
                        )
                    }
                    val deposits = depositsDeferred.await().map {
                        ActivityItemUi(
                            dateLabel = toDateLabel(it.createdAt),
                            title = "Deposited ${it.amount} SKR to Vault",
                            signature = it.signature,
                            type = ActivityTypeUi.DEPOSIT,
                            createdAt = it.createdAt,
                        )
                    }

                    val merged = (burns + deposits).sortedByDescending { it.createdAt }
                    _uiState.update { it.copy(isLoading = false, items = merged) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    private fun toDateLabel(value: String): String {
        return try {
            val instant = Instant.parse(value)
            val date = instant.atZone(ZoneId.systemDefault()).toLocalDate()
            val today = LocalDate.now(ZoneId.systemDefault())
            when (date) {
                today -> "Today"
                today.minusDays(1) -> "Yesterday"
                else -> date.format(DateTimeFormatter.ofPattern("MMM dd, yyyy"))
            }
        } catch (_: Exception) {
            value
        }
    }
}

data class ActivityUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val items: List<ActivityItemUi> = emptyList(),
)

data class ActivityItemUi(
    val dateLabel: String,
    val title: String,
    val signature: String?,
    val type: ActivityTypeUi,
    val createdAt: String,
)

enum class ActivityTypeUi {
    BURN,
    DEPOSIT,
}
