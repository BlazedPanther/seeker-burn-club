package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import club.seekerburn.app.model.LeaderboardEntry
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.theme.SeekerBurnTheme

enum class LeaderboardTab(val label: String, val apiKey: String) {
    STREAK("Streak", "streak"),
    LIFETIME("Lifetime", "lifetime"),
    BADGES("Badges", "badges"),
    XP("XP", "xp"),
    REFERRALS("Referrals", "referrals"),
}

@Composable
fun LeaderboardTab(
    rankings: List<LeaderboardEntry>,
    userRank: LeaderboardEntry?,
    selectedTab: LeaderboardTab,
    onTabChange: (LeaderboardTab) -> Unit,
    isLoading: Boolean,
    error: String? = null,
    currentWalletAddress: String? = null,
) {
    val colors = SeekerBurnTheme.colors

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .statusBarsPadding(),
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Leaderboard",
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = FontWeight.Bold,
            ),
            color = colors.textPrimary,
            modifier = Modifier.padding(horizontal = 20.dp),
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Tab row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            LeaderboardTab.entries.forEach { tab ->
                FilterChip(
                    selected = selectedTab == tab,
                    onClick = { onTabChange(tab) },
                    label = {
                        Text(
                            tab.label,
                            fontWeight = if (selectedTab == tab) FontWeight.Bold else FontWeight.Normal,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    shape = RoundedCornerShape(10.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = colors.primary.copy(alpha = 0.15f),
                        selectedLabelColor = colors.primary,
                        containerColor = colors.surfaceElevated,
                        labelColor = colors.textSecondary,
                    ),
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = selectedTab == tab,
                        borderColor = colors.borderSubtle,
                        selectedBorderColor = colors.primary.copy(alpha = 0.4f),
                    ),
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = colors.primary)
            }
        } else if (error != null) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Could not load ${selectedTab.label.lowercase()} leaderboard",
                        style = MaterialTheme.typography.bodyLarge,
                        color = colors.textSecondary,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textTertiary,
                    )
                }
            }
        } else if (rankings.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "No burns recorded yet. Be the first!",
                    style = MaterialTheme.typography.bodyLarge,
                    color = colors.textSecondary,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 20.dp),
            ) {
                itemsIndexed(rankings, key = { _, e -> e.rank }) { index, entry ->
                    LeaderboardRow(
                        entry = entry,
                        isCurrentUser = currentWalletAddress != null &&
                                entry.walletAddress.equals(currentWalletAddress, ignoreCase = true),
                    )
                    if (index < rankings.lastIndex) {
                        HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
                    }
                }

                // User's rank pinned at bottom
                if (userRank != null) {
                    item {
                        HorizontalDivider(
                            color = colors.primary.copy(alpha = 0.3f),
                            thickness = 1.dp,
                            modifier = Modifier.padding(vertical = 8.dp),
                        )
                        Text(
                            text = "Your Rank",
                            style = MaterialTheme.typography.labelMedium,
                            color = colors.textSecondary,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                        LeaderboardRow(
                            entry = userRank,
                            isCurrentUser = true,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LeaderboardRow(
    entry: LeaderboardEntry,
    isCurrentUser: Boolean,
) {
    val colors = SeekerBurnTheme.colors
    val rankIcon = when (entry.rank) {
        1 -> BurnIcons.MedalGold
        2 -> BurnIcons.MedalSilver
        3 -> BurnIcons.MedalBronze
        else -> null
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (isCurrentUser) Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.primary.copy(alpha = 0.1f))
                else Modifier
            )
            .padding(vertical = 12.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Rank
        if (rankIcon != null) {
            Box(modifier = Modifier.width(36.dp), contentAlignment = Alignment.Center) {
                BurnIcon(icon = rankIcon, contentDescription = "Rank ${entry.rank}", size = 24.dp)
            }
        } else {
            Text(
                text = "${entry.rank}",
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textTertiary,
                modifier = Modifier.width(36.dp),
            )
        }

        // Address + optional profile title
        Column(
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = entry.truncatedAddress,
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textPrimary,
                fontWeight = if (isCurrentUser) FontWeight.SemiBold else FontWeight.Normal,
            )
            if (!entry.profileTitle.isNullOrEmpty()) {
                Text(
                    text = entry.profileTitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.primary,
                )
            }
        }

        // Value
        Text(
            text = entry.displayValue,
            style = MaterialTheme.typography.bodyMedium,
            color = if (isCurrentUser) colors.primary else colors.textSecondary,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
