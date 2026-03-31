package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils

@Composable
fun MoreTab(
    walletAddress: String?,
    onPerks: () -> Unit,
    onActivity: () -> Unit,
    onTreasury: () -> Unit,
    onReferrals: () -> Unit,
    onSettings: () -> Unit,
    onAbout: () -> Unit,
    onChallenges: () -> Unit,
    onShop: () -> Unit,
    onInventory: () -> Unit,
    onHowItWorks: () -> Unit,
    onDisconnect: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    val clipboardManager = LocalClipboardManager.current
    var showDisconnectDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .padding(horizontal = 20.dp)
            .statusBarsPadding(),
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "More",
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            ),
            color = colors.textPrimary,
        )

        Spacer(modifier = Modifier.height(20.dp))

        // Menu items
        BurnCard {
            MoreMenuItem(icon = Icons.Filled.EmojiEvents, label = "Challenges", onClick = onChallenges)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.ShoppingCart, label = "Shield Shop", onClick = onShop)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.Star, label = "Lucky Burns", onClick = onInventory)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.GroupAdd, label = "Referrals", onClick = onReferrals)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.CardGiftcard, label = "Perks", onClick = onPerks)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.History, label = "Activity", onClick = onActivity)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.AccountBalance, label = "Treasury", onClick = onTreasury)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.Settings, label = "Settings", onClick = onSettings)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.MenuBook, label = "How It Works", onClick = onHowItWorks)
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            MoreMenuItem(icon = Icons.Filled.Info, label = "About", onClick = onAbout)
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Wallet section
        if (walletAddress != null) {
            BurnCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(
                            text = "Wallet",
                            style = MaterialTheme.typography.labelMedium,
                            color = colors.textSecondary,
                        )
                        Text(
                            text = FormatUtils.truncateAddress(walletAddress),
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.textPrimary,
                        )
                    }

                    IconButton(onClick = {
                        clipboardManager.setText(AnnotatedString(walletAddress))
                    }) {
                        Icon(
                            imageVector = Icons.Filled.ContentCopy,
                            contentDescription = "Copy address",
                            tint = colors.textSecondary,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                TextButton(
                    onClick = { showDisconnectDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = "Disconnect",
                        color = colors.error,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }
    }

    // Disconnect confirmation dialog
    if (showDisconnectDialog) {
        AlertDialog(
            onDismissRequest = { showDisconnectDialog = false },
            title = { Text("Disconnect Wallet?") },
            text = { Text("You'll need to reconnect to use the app.") },
            confirmButton = {
                TextButton(onClick = {
                    showDisconnectDialog = false
                    onDisconnect()
                }) {
                    Text("Disconnect", color = SeekerBurnTheme.colors.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDisconnectDialog = false }) {
                    Text("Cancel")
                }
            },
        )
    }
}

@Composable
private fun MoreMenuItem(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = colors.textSecondary,
            modifier = Modifier.size(24.dp),
        )
        Spacer(modifier = Modifier.width(16.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            color = colors.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = colors.textTertiary,
        )
    }
}

