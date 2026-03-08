package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.ui.components.BurnButton
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.StatRow
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.viewmodel.HomeViewModel
import club.seekerburn.app.viewmodel.PerkDetailViewModel

/**
 * Detail view for a single perk.
 * Perk states: AVAILABLE, CLAIMED, LOCKED, SOLD_OUT.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PerkDetailScreen(
    perkId: String,
    onBack: () -> Unit,
    onClaim: (String) -> Unit,
    perkViewModel: PerkDetailViewModel = hiltViewModel(),
    homeViewModel: HomeViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val perkState by perkViewModel.uiState.collectAsState()
    val homeState by homeViewModel.uiState.collectAsState()
    val perk = perkState.perk

    // Derive perk display state from real API data
    val currentStreak = homeState.currentStreak
    val perkDisplayState = when {
        perk == null -> PerkState.LOCKED
        perk.userClaimed -> PerkState.CLAIMED
        perk.totalSupply != null && perk.claimedCount >= perk.totalSupply -> PerkState.SOLD_OUT
        perk.userEligible -> PerkState.AVAILABLE
        else -> PerkState.LOCKED
    }
    val requiredStreak = perk?.requiredStreak ?: 0
    val totalSlots = perk?.totalSupply ?: 0
    val claimedSlots = perk?.claimedCount ?: 0

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Perk Details") },
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
        when {
            perkState.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = colors.primary)
                }
            }
            perkState.notFound || perk == null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Perk not found", color = colors.textSecondary)
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(modifier = Modifier.height(24.dp))

                    // Perk icon
                    Surface(
                        modifier = Modifier.size(100.dp),
                        shape = CircleShape,
                        color = when (perkDisplayState) {
                            PerkState.AVAILABLE -> colors.primary.copy(alpha = 0.15f)
                            PerkState.CLAIMED -> colors.success.copy(alpha = 0.15f)
                            else -> colors.surfaceElevated
                        },
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            BurnIcon(icon = BurnIcons.Ticket, contentDescription = "Perk", size = 48.dp)
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Text(
                        text = perk.name,
                        style = MaterialTheme.typography.headlineMedium,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = perk.description,
                        style = MaterialTheme.typography.bodyLarge,
                        color = colors.textSecondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )

                    if (perk.provider != null) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "by ${perk.provider}",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.textTertiary,
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Status card
                    BurnCard {
                        when (perkDisplayState) {
                            PerkState.AVAILABLE -> {
                                StatRow(label = "Status", value = "Available")
                                StatRow(label = "Your streak", value = "$currentStreak days (eligible)")
                            }
                            PerkState.CLAIMED -> {
                                StatRow(label = "Status", value = "Claimed")
                            }
                            PerkState.LOCKED -> {
                                StatRow(label = "Status", value = "Locked")
                                if (requiredStreak > 0) {
                                    StatRow(label = "Required streak", value = "$requiredStreak days")
                                    StatRow(label = "Your streak", value = "$currentStreak days")

                                    Spacer(modifier = Modifier.height(12.dp))
                                    val progress = if (requiredStreak > 0) {
                                        currentStreak.toFloat() / requiredStreak.toFloat()
                                    } else 0f
                                    LinearProgressIndicator(
                                        progress = { progress.coerceIn(0f, 1f) },
                                        modifier = Modifier.fillMaxWidth().height(8.dp),
                                        color = colors.primary,
                                        trackColor = colors.surfaceElevated,
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = "${(requiredStreak - currentStreak).coerceAtLeast(0)} more day(s) needed",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = colors.textTertiary,
                                    )
                                }
                            }
                            PerkState.SOLD_OUT -> {
                                StatRow(label = "Status", value = "Sold Out")
                            }
                        }

                        if (totalSlots > 0) {
                            Spacer(modifier = Modifier.height(8.dp))
                            StatRow(label = "Availability", value = "$claimedSlots / $totalSlots claimed")
                        }
                    }

                    if (perkState.error != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = perkState.error.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.error,
                        )
                    }

                    Spacer(modifier = Modifier.weight(1f))

                    // CTA
                    when (perkDisplayState) {
                        PerkState.AVAILABLE -> {
                            BurnButton(
                                text = if (perkState.isClaiming) "Claiming…" else "Claim Perk",
                                onClick = { perkViewModel.claimPerk("") },
                                enabled = !perkState.isClaiming,
                            )
                        }
                        PerkState.CLAIMED -> {
                            Surface(
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                shape = RoundedCornerShape(16.dp),
                                color = colors.success.copy(alpha = 0.12f),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        "Already Claimed",
                                        color = colors.success,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }
                        PerkState.LOCKED -> {
                            Surface(
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                shape = RoundedCornerShape(16.dp),
                                color = colors.surfaceElevated,
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        if (requiredStreak > 0) "Reach ${requiredStreak}-day streak to unlock"
                                        else "Not yet eligible",
                                        color = colors.textTertiary,
                                    )
                                }
                            }
                        }
                        PerkState.SOLD_OUT -> {
                            Surface(
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                shape = RoundedCornerShape(16.dp),
                                color = colors.error.copy(alpha = 0.12f),
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text("Sold Out", color = colors.error, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }
}

enum class PerkState {
    AVAILABLE,
    CLAIMED,
    LOCKED,
    SOLD_OUT,
}
