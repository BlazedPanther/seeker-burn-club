package club.seekerburn.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.SvgDecoder
import club.seekerburn.app.data.local.SettingsStore
import club.seekerburn.app.notifications.NotificationScheduler
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@HiltAndroidApp
class SeekerBurnApp : Application(), ImageLoaderFactory {

    @Inject lateinit var settingsStore: SettingsStore
    @Inject lateinit var notificationScheduler: NotificationScheduler

    override fun onCreate() {
        super.onCreate()

        notificationScheduler.ensureNotificationChannel()
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            val notificationsEnabled = settingsStore.notificationsEnabled.first()
            val dailyReminderEnabled = settingsStore.dailyReminder.first()
            notificationScheduler.syncSettings(notificationsEnabled, dailyReminderEnabled)
        }
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .components {
                add(SvgDecoder.Factory())
            }
            .crossfade(true)
            .build()
    }
}
