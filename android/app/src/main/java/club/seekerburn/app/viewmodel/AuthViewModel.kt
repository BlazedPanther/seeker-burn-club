package club.seekerburn.app.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.BuildConfig
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.data.local.SessionStore
import club.seekerburn.app.data.solana.WalletAdapterService
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import club.seekerburn.app.model.AuthVerifyRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Handles wallet connection (authorize → SIWS sign → backend verify → session create).
 */
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val api: SeekerBurnApi,
    private val walletAdapter: WalletAdapterService,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private companion object {
        const val TAG = "AuthViewModel"
    }

    private val _state = MutableStateFlow<AuthState>(AuthState.Idle)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    val isLoggedIn: Flow<Boolean> = sessionStore.authToken.map { it != null }
    val walletAddress: Flow<String?> = sessionStore.walletAddress
    val isOnboardingComplete: Flow<Boolean> = sessionStore.isOnboardingComplete
    val isTermsAccepted: Flow<Boolean> = sessionStore.isTermsAccepted

    /**
     * Full connect flow: Wallet authorize → SIWS → backend verify → save session.
     */
    fun connect(sender: ActivityResultSender) {
        viewModelScope.launch {
            _state.value = AuthState.Connecting

            try {
                // Step 1: Authorize with wallet
                val walletAddress = walletAdapter.authorize(sender)
                _state.value = AuthState.Signing

                // Step 2: Get SIWS challenge from backend
                val challenge = api.getChallenge(walletAddress)

                // Step 3: Sign the message with wallet
                val messageBytes = challenge.message.toByteArray(Charsets.UTF_8)
                val signatureBytes = walletAdapter.signMessage(sender, messageBytes)
                val signatureBase58 = org.sol4k.Base58.encode(signatureBytes)

                _state.value = AuthState.Verifying

                // Step 4: Verify with backend using a stable install-scoped fingerprint
                val fingerprintHash = sessionStore.getDeviceFingerprintHash()

                val verifyResponse = api.verifyAuth(
                    AuthVerifyRequest(
                        walletAddress = walletAddress,
                        signature = signatureBase58,
                        nonce = challenge.nonce,
                        deviceFingerprint = fingerprintHash,
                    )
                )

                // Step 5: Save session
                sessionStore.saveSession(
                    wallet = walletAddress,
                    token = verifyResponse.token,
                    expiresAt = verifyResponse.expiresAt,
                )

                _state.value = AuthState.Connected(walletAddress)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) Log.e(TAG, "Wallet connect flow failed", e)
                _state.value = AuthState.Error(e.message ?: "Connection failed")
            }
        }
    }

    fun disconnect() {
        viewModelScope.launch {
            try {
                api.logout()
            } catch (_: Exception) { /* best effort */ }
            walletAdapter.disconnect()
            sessionStore.clearSession()
            _state.value = AuthState.Idle
        }
    }

    fun completeOnboarding() {
        viewModelScope.launch {
            sessionStore.completeOnboarding()
        }
    }

    fun acceptTerms() {
        viewModelScope.launch {
            sessionStore.acceptTerms()
        }
    }
}

sealed class AuthState {
    data object Idle : AuthState()
    data object Connecting : AuthState()
    data object Signing : AuthState()
    data object Verifying : AuthState()
    data class Connected(val walletAddress: String) : AuthState()
    data class Error(val message: String) : AuthState()
}
