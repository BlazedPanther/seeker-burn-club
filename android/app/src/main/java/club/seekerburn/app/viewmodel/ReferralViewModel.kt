package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.di.ApiException
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.model.ReferralHistoryItem
import club.seekerburn.app.model.ReferralOverview
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

@HiltViewModel
class ReferralViewModel @Inject constructor(
    private val api: SeekerBurnApi,
) : ViewModel() {

    private val referralCodeRegex = Regex("^SBC-[A-Z2-9]{8}$")

    private val _uiState = MutableStateFlow(ReferralUiState())
    val uiState: StateFlow<ReferralUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val overview = api.getReferralOverview()
                val history = api.getReferralHistory()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        overview = overview,
                        history = history,
                        applySuccess = null,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "Failed to load referrals") }
            }
        }
    }

    fun updateInput(code: String) {
        val normalized = code
            .uppercase()
            .filter { it.isLetterOrDigit() || it == '-' }
            .take(12)
        _uiState.update { it.copy(inputCode = normalized, applyError = null, applySuccess = null) }
    }

    fun applyCode() {
        val code = _uiState.value.inputCode.trim()
        if (code.isBlank()) {
            _uiState.update { it.copy(applyError = "Please enter a referral code") }
            return
        }
        if (!referralCodeRegex.matches(code)) {
            _uiState.update { it.copy(applyError = "Invalid format. Use SBC-XXXXXXXX") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isApplying = true, applyError = null, applySuccess = null) }
            try {
                val result = api.applyReferralCode(code)
                _uiState.update {
                    it.copy(
                        isApplying = false,
                        applySuccess = if (result.success) "Referral applied successfully" else null,
                        inputCode = "",
                    )
                }
                refresh()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isApplying = false,
                        applyError = mapApplyError(e),
                    )
                }
            }
        }
    }

    private fun mapApplyError(error: Exception): String {
        if (error is ApiException) {
            val code = extractErrorCode(error.body)
            return when (code) {
                "INVALID_REFERRAL_CODE_FORMAT" -> "Invalid format. Use SBC-XXXXXXXX"
                "REFERRAL_CODE_INVALID" -> "Referral code was not found."
                "REFERRAL_ALREADY_APPLIED" -> "Referral is already applied on this account."
                "REFERRAL_SELF_NOT_ALLOWED" -> "You cannot apply your own referral code."
                "REFERRAL_WINDOW_EXPIRED" -> "Referral apply window has expired for this account."
                "REFERRAL_REJECTED_SYBIL" -> "Referral cannot be applied due to security checks."
                "RATE_LIMIT_EXCEEDED" -> "Too many attempts. Please try again later."
                else -> "Failed to apply referral. Please try again."
            }
        }
        return error.message ?: "Failed to apply referral. Please try again."
    }

    private fun extractErrorCode(rawBody: String): String? {
        return runCatching {
            Json.parseToJsonElement(rawBody)
                .jsonObject["error"]
                ?.jsonPrimitive
                ?.content
        }.getOrNull()
    }
}

data class ReferralUiState(
    val isLoading: Boolean = true,
    val isApplying: Boolean = false,
    val error: String? = null,
    val applyError: String? = null,
    val applySuccess: String? = null,
    val inputCode: String = "",
    val overview: ReferralOverview? = null,
    val history: List<ReferralHistoryItem> = emptyList(),
)
