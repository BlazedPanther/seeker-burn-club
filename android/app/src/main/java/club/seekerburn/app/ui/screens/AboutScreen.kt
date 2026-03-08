package club.seekerburn.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import club.seekerburn.app.BuildConfig
import club.seekerburn.app.R
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.theme.SeekerBurnTheme

/**
 * About screen - app logo, version, mission statement, legal links.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutScreen(
    onBack: () -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("About") },
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
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(40.dp))

            // App icon
            Surface(
                modifier = Modifier.size(96.dp),
                shape = CircleShape,
                color = colors.primary.copy(alpha = 0.15f),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Image(
                        painter = painterResource(R.mipmap.ic_launcher_foreground),
                        contentDescription = "Seeker Burn",
                        modifier = Modifier.size(64.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Seeker Burn Club",
                style = MaterialTheme.typography.headlineMedium,
                color = colors.textPrimary,
                fontWeight = FontWeight.Bold,
            )

            Text(
                text = "v${BuildConfig.VERSION_NAME} (${BuildConfig.BUILD_TYPE})",
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textTertiary,
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Mission
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = colors.surfaceElevated,
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Our Mission",
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.primary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Seeker Burn Club makes daily SKR token burns engaging " +
                                "and transparent. Build streaks, earn NFT badges, " +
                                "and contribute to the Seeker ecosystem - one burn at a time.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.textSecondary,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Links
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = colors.surfaceElevated,
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    AboutLinkRow("Website", "seekerburnclub.xyz") {
                        onOpenUrl("https://www.seekerburnclub.xyz/")
                    }
                    HorizontalDivider(color = colors.divider)
                    AboutLinkRow("Privacy", "/privacy") {
                        onOpenUrl("https://www.seekerburnclub.xyz/privacy/")
                    }
                    HorizontalDivider(color = colors.divider)
                    AboutLinkRow("Terms", "/terms") {
                        onOpenUrl("https://www.seekerburnclub.xyz/terms/")
                    }
                    HorizontalDivider(color = colors.divider)
                    AboutLinkRow("Legal Notice", "/impressum") {
                        onOpenUrl("https://www.seekerburnclub.xyz/impressum/")
                    }
                    HorizontalDivider(color = colors.divider)
                    AboutLinkRow("X / Twitter", "@seekerburnclub") {
                        onOpenUrl("https://x.com/seekerburnclub")
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Built with
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "Built with",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                )
                Spacer(modifier = Modifier.width(4.dp))
                BurnIcon(icon = BurnIcons.Heart, contentDescription = "love", size = 14.dp)
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "on Solana",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                )
            }

            Text(
                text = "Powered by Solana Mobile Stack",
                style = MaterialTheme.typography.bodySmall,
                color = colors.textTertiary,
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun AboutLinkRow(
    label: String,
    value: String,
    onClick: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    TextButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = colors.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = colors.primary,
        )
    }
}

