package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.model.Perk
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.viewmodel.PerksListViewModel

@Composable
fun PerksListScreen(
    onBack: () -> Unit,
    onPerkTap: (String) -> Unit,
    viewModel: PerksListViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .statusBarsPadding(),
    ) {
        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = colors.textPrimary,
                )
            }
            Text(
                text = "Perks",
                style = MaterialTheme.typography.titleLarge,
                color = colors.textPrimary,
            )
        }

        when {
            uiState.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.primary)
                }
            }
            uiState.error != null -> {
                Box(modifier = Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Failed to load perks", color = colors.textSecondary)
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(onClick = { viewModel.refresh() }) {
                            Text("Retry")
                        }
                    }
                }
            }
            uiState.perks.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
                    Text(
                        text = "No perks available yet.\nKeep burning to unlock rewards!",
                        style = MaterialTheme.typography.bodyLarge,
                        color = colors.textSecondary,
                    )
                }
            }
            else -> {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(uiState.perks, key = { it.id }) { perk ->
                        PerkListItem(perk = perk, onClick = { onPerkTap(perk.id) })
                    }
                    item { Spacer(modifier = Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@Composable
private fun PerkListItem(perk: Perk, onClick: () -> Unit) {
    val colors = SeekerBurnTheme.colors
    val isLocked = !perk.userClaimed && !perk.userEligible

    BurnCard {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (perk.userEligible && !perk.userClaimed)
                        Modifier.border(1.dp, colors.primary.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                    else Modifier
                )
                .clickable(enabled = !isLocked, onClick = onClick)
                .alpha(if (isLocked) 0.45f else 1f),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = perk.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = if (isLocked) colors.textTertiary else colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (perk.provider != null) {
                        Text(
                            text = "by ${perk.provider}",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.textTertiary,
                        )
                    }
                }

                // Status chip
                val (chipText, chipColor) = when {
                    perk.userClaimed -> "Claimed" to colors.success
                    perk.userEligible -> "Available" to colors.primary
                    else -> "Locked" to colors.textTertiary
                }
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = chipColor.copy(alpha = 0.15f),
                ) {
                    Text(
                        text = chipText,
                        style = MaterialTheme.typography.labelSmall,
                        color = chipColor,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = perk.description,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isLocked) colors.textTertiary else colors.textSecondary,
                maxLines = 2,
            )

            if (isLocked && perk.requiredBadgeId != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Requires ${perk.requiredBadgeId.replace('_', ' ')} badge",
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.textTertiary,
                )
            }

            if (perk.totalSupply != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${perk.claimedCount}/${perk.totalSupply} claimed",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                )
            }
        }
    }
}
