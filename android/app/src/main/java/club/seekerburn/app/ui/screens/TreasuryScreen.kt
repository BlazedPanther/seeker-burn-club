package club.seekerburn.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.util.FormatUtils
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.ShimmerBox
import club.seekerburn.app.ui.components.StatRow
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.viewmodel.TreasuryViewModel
import java.text.NumberFormat
import java.util.Locale

/**
 * Treasury transparency dashboard.
 * Shows real vault balance, ATA addresses, global stats from backend, and mismatch warning.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TreasuryScreen(
    onBack: () -> Unit,
    onViewExplorer: (String) -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    val context = LocalContext.current
    val viewModel: TreasuryViewModel = hiltViewModel()
    val uiState by viewModel.uiState.collectAsState()

    val treasuryWallet = SeekerBurnConfig.TREASURY_WALLET
    val stats = uiState.stats
    val numberFormat = remember { NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 2 } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Treasury") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = "Refresh",
                            tint = colors.textSecondary,
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
            Spacer(modifier = Modifier.height(12.dp))

            // Loading state
            if (uiState.isLoading && stats == null) {
                repeat(3) {
                    ShimmerBox(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(120.dp)
                            .padding(vertical = 8.dp)
                    )
                }
            } else if (uiState.error != null && stats == null) {
                // Error state
                BurnCard {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = "Failed to load treasury data",
                            style = MaterialTheme.typography.titleMedium,
                            color = colors.error,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = uiState.error ?: "Unknown error",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.textTertiary,
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedButton(onClick = { viewModel.refresh() }) {
                            Text("Retry")
                        }
                    }
                }
            } else {
                // Vault balance hero
                BurnCard {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        BurnIcon(icon = BurnIcons.Vault, contentDescription = "Vault", size = 36.dp)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Vault Balance",
                            style = MaterialTheme.typography.titleMedium,
                            color = colors.textSecondary,
                        )
                        Text(
                            text = "${numberFormat.format(stats?.vaultBalanceDouble ?: 0.0)} SKR",
                            style = MaterialTheme.typography.headlineLarge,
                            color = colors.primary,
                            fontWeight = FontWeight.Bold,
                        )
                        if (stats?.treasuryATAVerified == true) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                BurnIcon(icon = BurnIcons.Verified, contentDescription = null, size = 14.dp)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "On-chain verified",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = colors.success,
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Treasury address card
                BurnCard {
                    Text(
                        text = "Treasury ATA",
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    val ataAddress = stats?.treasuryATA ?: treasuryWallet
                    val displayAddr = FormatUtils.truncateAddress(ataAddress, 10, 10)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = displayAddr,
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.textSecondary,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = "Copy",
                            style = MaterialTheme.typography.labelMedium,
                            color = colors.primary,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("Treasury", ataAddress))
                                Toast.makeText(context, "Address copied", Toast.LENGTH_SHORT).show()
                            },
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedButton(
                        onClick = { onViewExplorer(FormatUtils.solscanAccountUrl(ataAddress)) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text("View on Solscan")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Global burn stats
                BurnCard {
                    Text(
                        text = "Global Burn Stats",
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    StatRow(
                        label = "Total SKR burned",
                        value = "${numberFormat.format(stats?.totalBurnedDouble ?: 0.0)} SKR",
                    )
                    StatRow(
                        label = "Burn transactions",
                        value = "${stats?.burnsToday ?: 0} today",
                    )
                    StatRow(
                        label = "Total SKR deposited",
                        value = "${numberFormat.format((stats?.totalDeposited?.toDoubleOrNull() ?: 0.0))} SKR",
                    )
                    StatRow(
                        label = "Unique burners",
                        value = "${stats?.totalMembers ?: 0}",
                    )
                }

                // Mismatch warning
                if (uiState.hasMismatch) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        color = colors.warning.copy(alpha = 0.12f),
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Warning,
                                contentDescription = null,
                                tint = colors.warning,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text(
                                    text = "Transparency Notice",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = colors.warning,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = "The on-chain Treasury balance differs from expected. This may be due to pending transactions.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = colors.warning.copy(alpha = 0.8f),
                                )
                            }
                        }
                    }
                }

                // Last updated
                if (stats?.lastUpdated?.isNotBlank() == true) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Last updated: ${stats.lastUpdated.substringBefore('T')}",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textTertiary,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}
