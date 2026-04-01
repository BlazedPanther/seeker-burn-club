package club.seekerburn.app.ui.screens

import android.content.Intent
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import club.seekerburn.app.ui.components.BurnButton
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.FireParticleEffect
import club.seekerburn.app.ui.components.StatRow
import club.seekerburn.app.ui.components.luckyItemIcon
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils

/**
 * Success screen after confirmed on-chain burn.
 * Shows burn details, optional badge earned, and confetti.
 */
@Composable
fun TransactionSuccessScreen(
    signature: String,
    burnAmount: String,
    newStreak: Int,
    badgeEarned: String?, // null if no badge earned on this burn
    badgeEarnedId: String? = null, // badge ID for navigation to claim
    luckyDropName: String? = null,
    luckyDropItemId: String? = null,
    luckyDropRarity: String? = null,
    luckyDropEffect: String? = null,
    luckyDropsToday: Int? = null,
    maxDailyLuckyDrops: Int = 3,
    xpEarned: Int? = null,
    newLevel: Int? = null,
    levelTitle: String? = null,
    leveledUp: Boolean = false,
    onViewExplorer: (String) -> Unit,
    onClaimNft: (String) -> Unit = {},
    onDone: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    // Pop-in animation for checkmark
    val checkScale = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        checkScale.animateTo(
            targetValue = 1f,
            animationSpec = spring(
                dampingRatio = Spring.DampingRatioMediumBouncy,
                stiffness = Spring.StiffnessMediumLow,
            ),
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .padding(horizontal = 20.dp)
            .statusBarsPadding()
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.height(48.dp))

        // Animated checkmark
        Box(
            modifier = Modifier
                .size(100.dp)
                .scale(checkScale.value),
            contentAlignment = Alignment.Center,
        ) {
            Surface(
                modifier = Modifier.size(100.dp),
                shape = CircleShape,
                color = colors.success.copy(alpha = 0.15f),
            ) {}
            BurnIcon(icon = BurnIcons.CheckCircle, contentDescription = "Success", size = 48.dp)
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Burn Complete!",
            style = MaterialTheme.typography.headlineMedium,
            color = colors.success,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Your $burnAmount SKR has been permanently destroyed.",
            style = MaterialTheme.typography.bodyLarge,
            color = colors.textSecondary,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Burn details card
        BurnCard {
            StatRow(label = "Amount burned", value = "$burnAmount SKR", valueColor = colors.primary)
            StatRow(label = "Current streak", value = "$newStreak day${if (newStreak != 1) "s" else ""}")

            val displaySig = FormatUtils.truncateSignature(signature)
            StatRow(label = "Signature", value = displaySig)
        }

        // XP earned section
        if (xpEarned != null && xpEarned > 0) {
            Spacer(modifier = Modifier.height(16.dp))

            BurnCard {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    BurnIcon(icon = BurnIcons.Starburst, contentDescription = "XP earned", size = 40.dp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "+${xpEarned} XP",
                        style = MaterialTheme.typography.titleLarge,
                        color = colors.warning,
                        fontWeight = FontWeight.Bold,
                    )
                    if (newLevel != null && levelTitle != null) {
                        Spacer(modifier = Modifier.height(4.dp))
                        if (leveledUp) {
                            Text(
                                text = "Level Up!",
                                style = MaterialTheme.typography.titleMedium,
                                color = colors.primary,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                        }
                        Text(
                            text = "Level $newLevel — $levelTitle",
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (leveledUp) colors.primary else colors.textSecondary,
                        )
                    }
                }
            }
        }

        // Badge earned section
        if (badgeEarned != null) {
            Spacer(modifier = Modifier.height(16.dp))

            BurnCard {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    BurnIcon(icon = BurnIcons.Trophy, contentDescription = "Badge earned", size = 40.dp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Badge Earned!",
                        style = MaterialTheme.typography.titleLarge,
                        color = colors.primary,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = badgeEarned,
                        style = MaterialTheme.typography.bodyLarge,
                        color = colors.textPrimary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "A unique Burn Spirit creature NFT was generated for you!",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textTertiary,
                        textAlign = TextAlign.Center,
                    )

                    if (badgeEarnedId != null) {
                        Spacer(modifier = Modifier.height(12.dp))

                        Button(
                            onClick = { onClaimNft(badgeEarnedId) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = colors.primary,
                                contentColor = colors.textOnPrimary,
                            ),
                        ) {
                            Text("\uD83D\uDD25 View & Claim NFT")
                        }
                    }
                }
            }
        }

        // Lucky Drop section
        val burnAmountNum = burnAmount.toDoubleOrNull() ?: 0.0
        if (luckyDropName == null) {
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BurnIcon(icon = BurnIcons.StarGlow, contentDescription = null, size = 14.dp)
                Spacer(modifier = Modifier.width(6.dp))
                if (burnAmountNum < 3.0) {
                    Text(
                        text = "Burn ≥3 SKR per burn for a Lucky Drop chance (max 3/day)",
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.textTertiary,
                    )
                } else if (luckyDropsToday != null) {
                    val remaining = maxDailyLuckyDrops - luckyDropsToday
                    Text(
                        text = if (remaining > 0)
                            "$luckyDropsToday/$maxDailyLuckyDrops Lucky Drops today — $remaining remaining"
                        else
                            "$luckyDropsToday/$maxDailyLuckyDrops Lucky Drops today — limit reached",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (remaining > 0) colors.textTertiary else colors.warning,
                    )
                } else {
                    Text(
                        text = "No Lucky Drop this time — burn again for another chance!",
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.textTertiary,
                    )
                }
            }
        }
        if (luckyDropName != null) {
            Spacer(modifier = Modifier.height(16.dp))

            val rarityColor = when (luckyDropRarity?.uppercase()) {
                "UNCOMMON" -> colors.warning
                "RARE" -> colors.pixelCyan
                "EPIC" -> colors.primary
                "LEGENDARY" -> colors.warning
                "MYTHIC" -> colors.error
                else -> colors.textSecondary
            }

            // Animated entrance
            val dropScale = remember { Animatable(0f) }
            LaunchedEffect(Unit) {
                kotlinx.coroutines.delay(400) // slight delay after main checkmark
                dropScale.animateTo(
                    targetValue = 1f,
                    animationSpec = spring(
                        dampingRatio = Spring.DampingRatioMediumBouncy,
                        stiffness = Spring.StiffnessMediumLow,
                    ),
                )
            }

            BurnCard(
                modifier = Modifier.scale(dropScale.value),
            ) {
                Box(modifier = Modifier.fillMaxWidth()) {
                    // Fire effect for EPIC+ rarity
                    val isEpicPlus = luckyDropRarity?.uppercase() in listOf("EPIC", "LEGENDARY", "MYTHIC")
                    if (isEpicPlus) {
                        FireParticleEffect(
                            modifier = Modifier.fillMaxWidth().height(120.dp),
                            particleCount = if (luckyDropRarity?.uppercase() == "MYTHIC") 24 else 16,
                            intensity = if (luckyDropRarity?.uppercase() == "MYTHIC") 1.5f else 1f,
                        )
                    }
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        BurnIcon(
                            icon = luckyItemIcon(luckyDropItemId ?: ""),
                            contentDescription = luckyDropName,
                            size = 48.dp,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Lucky Drop!",
                            style = MaterialTheme.typography.titleLarge,
                            color = rarityColor,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = luckyDropName,
                            style = MaterialTheme.typography.titleMedium,
                            color = colors.textPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (luckyDropEffect != null) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = luckyDropEffect,
                                style = MaterialTheme.typography.bodyMedium,
                                color = colors.textSecondary,
                                textAlign = TextAlign.Center,
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = rarityColor.copy(alpha = 0.15f),
                        ) {
                            Text(
                                text = (luckyDropRarity ?: "COMMON").uppercase(),
                                style = MaterialTheme.typography.labelSmall,
                                color = rarityColor,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Share — primary CTA for virality
        val context = LocalContext.current
        BurnButton(
            text = "\uD83D\uDD25 Share Your Burn",
            onClick = {
                val shareText = buildString {
                    append("\uD83D\uDD25 I just burned $burnAmount SKR on Seeker Burn Club!")
                    append(" Day $newStreak streak!")
                    if (xpEarned != null && xpEarned > 0) append(" +${xpEarned} XP!")
                    if (leveledUp && levelTitle != null) append(" Leveled up to $levelTitle!")
                    if (badgeEarned != null) append(" \uD83C\uDFC6 Earned: $badgeEarned")
                    if (luckyDropName != null) append(" \uD83C\uDF1F Lucky Drop: $luckyDropName!")
                    append("\n\n${FormatUtils.solscanTxUrl(signature)}")
                    append("\n\n#SeekerBurnClub #Solana #SolanaMobile")
                }
                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                    putExtra(Intent.EXTRA_TEXT, shareText)
                    type = "text/plain"
                }
                context.startActivity(Intent.createChooser(sendIntent, "Share your burn"))
            },
            enabled = true,
        )

        Spacer(modifier = Modifier.height(8.dp))

        // View on explorer
        OutlinedButton(
            onClick = {
                onViewExplorer(FormatUtils.solscanTxUrl(signature))
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(16.dp),
        ) {
            Text("View on Solscan")
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = onDone,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(16.dp),
        ) {
            Text("Done")
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}
