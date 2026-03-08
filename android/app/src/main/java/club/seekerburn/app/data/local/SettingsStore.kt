package club.seekerburn.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.settingsDataStore by preferencesDataStore(name = "seeker_burn_settings")

/**
 * Persisted user settings via Jetpack DataStore.
 */
@Singleton
class SettingsStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val KEY_NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")
    private val KEY_DAILY_REMINDER = booleanPreferencesKey("daily_reminder")

    val notificationsEnabled: Flow<Boolean> = context.settingsDataStore.data
        .map { it[KEY_NOTIFICATIONS_ENABLED] ?: true }

    val dailyReminder: Flow<Boolean> = context.settingsDataStore.data
        .map { it[KEY_DAILY_REMINDER] ?: true }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_NOTIFICATIONS_ENABLED] = enabled }
    }

    suspend fun setDailyReminder(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_DAILY_REMINDER] = enabled }
    }
}
