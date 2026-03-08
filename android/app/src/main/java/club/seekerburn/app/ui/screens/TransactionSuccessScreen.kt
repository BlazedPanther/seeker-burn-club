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
import club.seekerburn.app.ui.components.StatRow
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

        Spacer(modifier = Modifier.weight(1f))

        // Share — primary CTA for virality
        val context = LocalContext.current
        BurnButton(
            text = "\uD83D\uDD25 Share Your Burn",
            onClick = {
                val shareText = buildString {
                    append("\uD83D\uDD25 I just burned $burnAmount SKR on Seeker Burn Club!")
                    append(" Day $newStreak streak!")
                    if (badgeEarned != null) append(" \uD83C\uDFC6 Earned: $badgeEarned")
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
