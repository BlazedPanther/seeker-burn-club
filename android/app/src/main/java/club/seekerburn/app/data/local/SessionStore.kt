package club.seekerburn.app.data.local

import android.content.Context
import android.content.SharedPreferences
import java.security.MessageDigest
import java.util.UUID
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "seeker_burn_session")

@Singleton
class SessionStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private companion object {
        const val KEY_DEVICE_INSTALL_ID = "device_install_id"
    }

    // Encrypted storage for sensitive auth data
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val encryptedPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "seeker_burn_secure",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    // Non-sensitive UI preferences stay in DataStore
    private val KEY_ONBOARDING_COMPLETE = stringPreferencesKey("onboarding_complete")

    // Use MutableStateFlow for truly reactive session state (not dependent on DataStore trigger hack)
    private val _sessionVersion = MutableStateFlow(0L)

    val walletAddress: Flow<String?> = _sessionVersion.map {
        encryptedPrefs.getString("wallet_address", null)
    }
    val authToken: Flow<String?> = _sessionVersion.map {
        encryptedPrefs.getString("auth_token", null)
    }
    val isOnboardingComplete: Flow<Boolean> = context.dataStore.data.map {
        it[KEY_ONBOARDING_COMPLETE] == "true"
    }

    fun getAuthToken(): String? = encryptedPrefs.getString("auth_token", null)
    fun getWalletAddress(): String? = encryptedPrefs.getString("wallet_address", null)

    /**
     * Returns a stable, install-scoped identifier stored in encrypted prefs.
     * This avoids using Build.FINGERPRINT, which is not unique per device/user.
     */
    fun getOrCreateInstallId(): String {
        val existing = encryptedPrefs.getString(KEY_DEVICE_INSTALL_ID, null)
        if (!existing.isNullOrBlank()) return existing

        val generated = UUID.randomUUID().toString()
        encryptedPrefs.edit().putString(KEY_DEVICE_INSTALL_ID, generated).commit()
        return generated
    }

    fun getDeviceFingerprintHash(): String {
        val installId = getOrCreateInstallId()
        return MessageDigest.getInstance("SHA-256")
            .digest(installId.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }

    fun getAuthTokenExpiry(): String? = encryptedPrefs.getString("auth_token_expiry", null)

    fun isTokenExpired(): Boolean {
        val expiry = getAuthTokenExpiry() ?: return true
        return try {
            val expiryTime = java.time.Instant.parse(expiry).toEpochMilli()
            // 30-second safety margin for clock skew between client and server
            System.currentTimeMillis() >= (expiryTime - 30_000L)
        } catch (_: Exception) {
            true
        }
    }

    suspend fun saveSession(wallet: String, token: String, expiresAt: String) {
        encryptedPrefs.edit()
            .putString("wallet_address", wallet)
            .putString("auth_token", token)
            .putString("auth_token_expiry", expiresAt)
            .commit() // sync write — critical auth data must persist before signaling flows
        _sessionVersion.update { it + 1 }
    }

    suspend fun completeOnboarding() {
        context.dataStore.edit { it[KEY_ONBOARDING_COMPLETE] = "true" }
    }

    suspend fun clearSession() {
        encryptedPrefs.edit()
            .remove("auth_token")
            .remove("wallet_address")
            .remove("auth_token_expiry")
            .commit() // sync write — ensure session is fully cleared before signaling flows
        _sessionVersion.update { it + 1 }
    }
}
