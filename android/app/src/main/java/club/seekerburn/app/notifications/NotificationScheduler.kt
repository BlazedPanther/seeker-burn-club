package club.seekerburn.app.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Duration
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    fun syncSettings(notificationsEnabled: Boolean, dailyReminderEnabled: Boolean) {
        if (!notificationsEnabled || !dailyReminderEnabled || !hasNotificationPermission()) {
            cancelDailyReminder()
            return
        }
        ensureNotificationChannel()
        scheduleDailyReminder(hour = 20, minute = 0)
    }

    fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            DAILY_CHANNEL_ID,
            "Daily Burn Reminder",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Daily reminder to protect your streak"
        }
        manager.createNotificationChannel(channel)
    }

    private fun scheduleDailyReminder(hour: Int, minute: Int) {
        val now = LocalDateTime.now()
        var next = now.withHour(hour).withMinute(minute).withSecond(0).withNano(0)
        if (!next.isAfter(now)) next = next.plusDays(1)
        val initialDelayMs = Duration.between(now, next).toMillis().coerceAtLeast(0L)

        val request = PeriodicWorkRequestBuilder<DailyReminderWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(initialDelayMs, TimeUnit.MILLISECONDS)
            .addTag(DAILY_WORK_NAME)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            DAILY_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    private fun cancelDailyReminder() {
        WorkManager.getInstance(context).cancelUniqueWork(DAILY_WORK_NAME)
    }

    private fun hasNotificationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    companion object {
        const val DAILY_CHANNEL_ID = "daily_burn_reminder"
        const val DAILY_WORK_NAME = "daily_burn_reminder_work"
        const val DAILY_NOTIFICATION_ID = 41001
    }
}
