package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.model.ActiveBuff
import club.seekerburn.app.model.InventoryItem
import club.seekerburn.app.model.LuckyDropHistoryItem
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.buffIcon
import club.seekerburn.app.ui.components.luckyItemIcon
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.viewmodel.InventoryViewModel

@Composable
fun InventoryScreen(
    onBack: () -> Unit,
    viewModel: InventoryViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = colors.textPrimary,
                )
            }
            BurnIcon(icon = BurnIcons.StarGlow, contentDescription = null, size = 24.dp)
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Lucky Burns",
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = colors.textPrimary,
            )
        }

        when {
            uiState.loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.primary)
                }
            }
            uiState.error != null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = uiState.error ?: "Error loading inventory",
                        color = colors.error,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // Active Buffs section
                    if (uiState.activeBuffs.isNotEmpty()) {
                        item {
                            Text(
                                text = "Active Buffs",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = colors.primary,
                            )
                        }
                        items(uiState.activeBuffs) { buff ->
                            BuffCard(buff)
                        }
                        item { Spacer(modifier = Modifier.height(8.dp)) }
                    }

                    // Inventory section
                    item {
                        Text(
                            text = "Inventory",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = colors.textPrimary,
                        )
                    }

                    if (uiState.inventory.isEmpty()) {
                        item {
                            BurnCard {
                                Column(
                                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Text(
                                        text = "No items yet",
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = colors.textSecondary,
                                    )
                                    Text(
                                        text = "Burn \u22653 SKR to get Lucky Drops!",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = colors.textTertiary,
                                        textAlign = TextAlign.Center,
                                    )
                                }
                            }
                        }
                    } else {
                        items(uiState.inventory) { item ->
                            InventoryItemCard(item)
                        }
                    }

                    // Drop History section
                    if (uiState.recentDrops.isNotEmpty()) {
                        item {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Recent Drops",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = colors.textPrimary,
                            )
                        }
                        items(uiState.recentDrops) { drop ->
                            DropHistoryCard(drop)
                        }
                    }

                    item { Spacer(modifier = Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@Composable
private fun InventoryItemCard(item: InventoryItem) {
    val colors = SeekerBurnTheme.colors
    val rarityColor = rarityColor(item.rarity)

    BurnCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BurnIcon(
                icon = luckyItemIcon(item.itemId),
                contentDescription = item.name,
                size = 36.dp,
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleSmall,
                    color = colors.textPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = item.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textSecondary,
                )
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = rarityColor.copy(alpha = 0.15f),
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    Text(
                        text = item.rarity.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = rarityColor,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
            }
            if (item.quantity > 1) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = colors.primary.copy(alpha = 0.15f),
                ) {
                    Text(
                        text = "x${item.quantity}",
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.primary,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun BuffCard(buff: ActiveBuff) {
    val colors = SeekerBurnTheme.colors
    val buffLabel = when (buff.buffType) {
        "XP_BOOST" -> "XP Boost"
        "GOLDEN_BURN" -> "Golden Burn"
        "LOOT_LUCK" -> "Loot Luck"
        else -> buff.buffType
    }

    BurnCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BurnIcon(icon = buffIcon(buff.buffType), contentDescription = null, size = 24.dp)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = buffLabel,
                    style = MaterialTheme.typography.titleSmall,
                    color = colors.primary,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Text(
                text = "${buff.remainingUses} remaining",
                style = MaterialTheme.typography.bodySmall,
                color = colors.textSecondary,
            )
        }
    }
}

@Composable
private fun DropHistoryCard(drop: LuckyDropHistoryItem) {
    val colors = SeekerBurnTheme.colors
    val rarityColor = rarityColor(drop.rarity)

    BurnCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BurnIcon(
                icon = luckyItemIcon(drop.itemId),
                contentDescription = drop.name,
                size = 28.dp,
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = drop.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = drop.rarity.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = rarityColor,
                )
            }
        }
    }
}

@Composable
private fun rarityColor(rarity: String) = when (rarity.uppercase()) {
    "UNCOMMON" -> SeekerBurnTheme.colors.warning
    "RARE" -> SeekerBurnTheme.colors.pixelCyan
    "EPIC" -> SeekerBurnTheme.colors.primary
    "LEGENDARY" -> SeekerBurnTheme.colors.warning
    "MYTHIC" -> SeekerBurnTheme.colors.error
    else -> SeekerBurnTheme.colors.textSecondary
}
