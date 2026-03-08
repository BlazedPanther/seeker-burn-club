package club.seekerburn.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import club.seekerburn.app.data.local.SettingsStore
import club.seekerburn.app.notifications.NotificationScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Drives the Settings screen with persisted preferences via DataStore.
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settingsStore: SettingsStore,
    private val notificationScheduler: NotificationScheduler,
) : ViewModel() {

    val notificationsEnabled: StateFlow<Boolean> = settingsStore.notificationsEnabled
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    val dailyReminder: StateFlow<Boolean> = settingsStore.dailyReminder
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    fun setNotificationsEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsStore.setNotificationsEnabled(enabled)
            if (!enabled) settingsStore.setDailyReminder(false)
            val daily = if (enabled) settingsStore.dailyReminder.first() else false
            notificationScheduler.syncSettings(enabled, daily)
        }
    }

    fun setDailyReminder(enabled: Boolean) {
        viewModelScope.launch {
            settingsStore.setDailyReminder(enabled)
            val notificationsEnabled = settingsStore.notificationsEnabled.first()
            notificationScheduler.syncSettings(notificationsEnabled, enabled)
        }
    }
}
