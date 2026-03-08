package club.seekerburn.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils
import club.seekerburn.app.viewmodel.AuthViewModel
import club.seekerburn.app.viewmodel.SettingsViewModel

/**
 * Settings screen with burn config, notifications, security, and legal.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onNavigateToAbout: () -> Unit,
    onOpenUrl: (String) -> Unit,
    settingsViewModel: SettingsViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val context = LocalContext.current
    val walletAddress by authViewModel.walletAddress.collectAsState(initial = null)
    val notificationsEnabled by settingsViewModel.notificationsEnabled.collectAsState()
    val dailyReminder by settingsViewModel.dailyReminder.collectAsState()

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        settingsViewModel.setNotificationsEnabled(granted)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.surface,
                    titleContentColor = colors.textPrimary,
                    navigationIconContentColor = colors.textPrimary,
                ),
            )
        },
        containerColor = colors.surface,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            // Burn Settings
            SettingsSectionHeader("Burn Settings")

            SettingsInfoRow(
                label = "Platform fee is mandatory",
                description = "${SeekerBurnConfig.PLATFORM_FEE_PERCENT.toInt()}% of each burn is always sent to Treasury.",
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Notifications
            SettingsSectionHeader("Notifications")

            SettingsToggleRow(
                label = "Push notifications",
                description = "Enable burn reminders and streak alerts",
                checked = notificationsEnabled,
                onToggle = { enabled ->
                    if (!enabled) {
                        settingsViewModel.setNotificationsEnabled(false)
                        return@SettingsToggleRow
                    }

                    val granted = ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.POST_NOTIFICATIONS,
                    ) == PackageManager.PERMISSION_GRANTED

                    if (granted) {
                        settingsViewModel.setNotificationsEnabled(true)
                    } else {
                        permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                },
            )

            if (notificationsEnabled) {
                SettingsToggleRow(
                    label = "Daily burn reminder",
                    description = "Send a daily reminder at 8:00 PM",
                    checked = dailyReminder,
                    onToggle = { settingsViewModel.setDailyReminder(it) },
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Security
            SettingsSectionHeader("Security")

            SettingsNavigationRow(
                label = "Connected wallet",
                value = walletAddress?.let { FormatUtils.truncateAddress(it) } ?: "Not connected",
                onClick = { /* navigate to wallet management */ },
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Legal
            SettingsSectionHeader("Legal")

            SettingsNavigationRow(
                label = "Terms of Service",
                onClick = { onOpenUrl("https://seekerburnclub.xyz/terms") },
            )

            SettingsNavigationRow(
                label = "Privacy Policy",
                onClick = { onOpenUrl("https://seekerburnclub.xyz/privacy") },
            )

            SettingsNavigationRow(
                label = "Open Source Licenses",
                onClick = { onOpenUrl("https://seekerburnclub.xyz/licenses") },
            )

            Spacer(modifier = Modifier.height(24.dp))

            // App info link
            SettingsNavigationRow(
                label = "About Seeker Burn Club",
                onClick = onNavigateToAbout,
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SettingsSectionHeader(title: String) {
    val colors = SeekerBurnTheme.colors
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        color = colors.primary,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

@Composable
private fun SettingsInfoRow(
    label: String,
    description: String,
) {
    val colors = SeekerBurnTheme.colors
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        color = colors.surfaceElevated,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = colors.textPrimary,
                )
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                )
            }
        }
    }
}

@Composable
private fun SettingsToggleRow(
    label: String,
    description: String,
    checked: Boolean,
    onToggle: (Boolean) -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        color = colors.surfaceElevated,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = colors.textPrimary,
                )
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                )
            }
            Switch(
                checked = checked,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = colors.primary,
                    checkedTrackColor = colors.primary.copy(alpha = 0.3f),
                ),
            )
        }
    }
}

@Composable
private fun SettingsNavigationRow(
    label: String,
    value: String? = null,
    onClick: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = colors.surfaceElevated,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                color = colors.textPrimary,
                modifier = Modifier.weight(1f),
            )
            if (value != null) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textTertiary,
                )
                Spacer(modifier = Modifier.width(4.dp))
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.textTertiary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

