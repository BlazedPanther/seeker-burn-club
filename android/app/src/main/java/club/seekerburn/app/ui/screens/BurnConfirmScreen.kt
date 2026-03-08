package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import club.seekerburn.app.BuildConfig
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.model.BadgeDefinition
import club.seekerburn.app.model.BadgeType
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.SectionHeader
import club.seekerburn.app.ui.components.StatRow
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils
import club.seekerburn.app.viewmodel.HomeViewModel
import kotlinx.coroutines.launch

/**
 * Bottom sheet-style burn confirmation screen.
 * Shows transaction breakdown before wallet signing.
 */
@Composable
fun BurnConfirmScreen(
    walletSender: ActivityResultSender,
    onDismiss: () -> Unit,
    onBurnSubmitted: (signature: String, newStreak: Int, burnAmount: String, badgeEarned: String?, badgeEarnedId: String?) -> Unit,
    onBurnSigned: (signature: String, burnAmount: String, feeAmount: String) -> Unit = { _, _, _ -> },
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val coroutineScope = rememberCoroutineScope()

    var isSubmitting by remember { mutableStateOf(false) }
    var submitError by remember { mutableStateOf<String?>(null) }
    var hasAcknowledgedIrreversible by remember { mutableStateOf(false) }

    // Pull current state from ViewModel
    val uiState by viewModel.uiState.collectAsState()

    val burnAmount = uiState.burnAmount
    val feeAmount = uiState.feeAmount
    val totalAmount = burnAmount + feeAmount

    // Format amounts via BigDecimal to avoid floating-point display artefacts
    val fmtBurn = java.math.BigDecimal.valueOf(burnAmount).stripTrailingZeros().toPlainString()
    val fmtFee = java.math.BigDecimal.valueOf(feeAmount).stripTrailingZeros().toPlainString()
    val fmtTotal = java.math.BigDecimal.valueOf(totalAmount).stripTrailingZeros().toPlainString()
    val fromAddress = if (uiState.walletAddress.isNotBlank()) {
        FormatUtils.truncateAddress(uiState.walletAddress)
    } else "Not connected"

    // Compute milestone: check if the next burn will trigger a streak badge
    val nextStreak = uiState.currentStreak + 1
    val streakBadge = BadgeDefinition.ALL.firstOrNull {
        it.type == BadgeType.STREAK && it.requirementValue == nextStreak
    }
    // Also check lifetime milestones
    val nextLifetime = uiState.lifetimeBurned + uiState.burnAmount
    val lifetimeBadge = BadgeDefinition.ALL.firstOrNull {
        it.type == BadgeType.LIFETIME &&
                it.requirementValue.toDouble() > uiState.lifetimeBurned &&
                it.requirementValue.toDouble() <= nextLifetime
    }
    val milestoneBadge = streakBadge ?: lifetimeBadge
    val isMilestone = milestoneBadge != null && milestoneBadge.id !in uiState.earnedBadgeIds
    val milestoneBadgeName: String? = milestoneBadge?.name

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .padding(horizontal = 20.dp)
            .statusBarsPadding()
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Drag handle visual
        Spacer(modifier = Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .width(40.dp)
                .height(4.dp)
                .background(colors.textTertiary, RoundedCornerShape(2.dp))
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Confirm Your Burn",
            style = MaterialTheme.typography.headlineMedium,
            color = colors.textPrimary,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = "Review the details below",
            style = MaterialTheme.typography.bodyMedium,
            color = colors.textSecondary,
        )

        Spacer(modifier = Modifier.height(20.dp))

        // Transaction breakdown
        BurnCard {
            StatRow(label = "Burn amount", value = "$fmtBurn SKR")
            StatRow(label = "Platform fee (${SeekerBurnConfig.PLATFORM_FEE_PERCENT.toInt()}%)", value = "$fmtFee SKR")
            Spacer(modifier = Modifier.height(4.dp))
            HorizontalDivider(color = colors.divider, thickness = 0.5.dp)
            Spacer(modifier = Modifier.height(4.dp))
            StatRow(label = "Total", value = "$fmtTotal SKR", valueColor = colors.primary)

            Spacer(modifier = Modifier.height(14.dp))

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = colors.surfaceElevated2,
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("From: $fromAddress", style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
                    Text("Burn to: Permanent burn (destroyed)", style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
                    Text("Fee to: Treasury ATA (verified)", style = MaterialTheme.typography.bodySmall, color = colors.success)
                }
            }
        }

        // Milestone alert (conditional)
        if (isMilestone && milestoneBadgeName != null) {
            Spacer(modifier = Modifier.height(12.dp))
            BurnCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BurnIcon(icon = BurnIcons.Trophy, contentDescription = "Badge", size = 28.dp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "You'll earn a badge!",
                            style = MaterialTheme.typography.titleMedium,
                            color = colors.primary,
                        )
                        Text(
                            text = "$milestoneBadgeName — An NFT will be minted to your wallet.",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.textSecondary,
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Irreversible action acknowledgment (required)
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            color = colors.warning.copy(alpha = 0.10f),
            border = androidx.compose.foundation.BorderStroke(1.dp, colors.warning.copy(alpha = 0.35f)),
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(
                        imageVector = Icons.Filled.Warning,
                        contentDescription = null,
                        tint = colors.warning,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "Irreversible action",
                            style = MaterialTheme.typography.titleSmall,
                            color = colors.warning,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Burned tokens are permanently destroyed and cannot be recovered.",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.textSecondary,
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { hasAcknowledgedIrreversible = !hasAcknowledgedIrreversible },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(
                        checked = hasAcknowledgedIrreversible,
                        onCheckedChange = null,
                        colors = CheckboxDefaults.colors(
                            checkedColor = colors.warning,
                            uncheckedColor = colors.textTertiary,
                            checkmarkColor = colors.surface,
                        ),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "I understand this burn is irreversible",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Action buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = onDismiss,
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
                shape = RoundedCornerShape(16.dp),
            ) {
                Text("Cancel")
            }

            Button(
                onClick = {
                    if (isSubmitting) return@Button
                    isSubmitting = true
                    submitError = null

                    coroutineScope.launch {
                        try {
                            val txBytes = viewModel.buildBurnTransaction()
                            val signature = viewModel.signAndSendTransaction(
                                sender = walletSender,
                                serializedTransaction = txBytes,
                            )
                            // Submit to backend with retry — tokens are already burned on-chain
                            // so we MUST record this. Backend's DUPLICATE_SIGNATURE check makes
                            // retries safe (idempotent).
                            var submitResponse: club.seekerburn.app.model.BurnSubmitResponse? = null
                            var lastError: Exception? = null
                            for (attempt in 0 until SeekerBurnConfig.BACKEND_SUBMIT_MAX_RETRIES) {
                                try {
                                    submitResponse = viewModel.submitBurn(signature)
                                    break
                                } catch (e: Exception) {
                                    lastError = e
                                    if (attempt < SeekerBurnConfig.BACKEND_SUBMIT_MAX_RETRIES - 1) {
                                        kotlinx.coroutines.delay((attempt + 1) * SeekerBurnConfig.BACKEND_SUBMIT_BACKOFF_MS)
                                    }
                                }
                            }
                            if (submitResponse != null) {
                                // Update ViewModel state immediately so HomeTab shows
                                // the correct streak/lifetimeBurned when navigating back
                                viewModel.refreshAfterBurn(
                                    newStreak = submitResponse.newStreak ?: (uiState.currentStreak + 1),
                                    longestStreak = submitResponse.longestStreak,
                                    lifetimeBurned = submitResponse.lifetimeBurned,
                                    badgesEarned = submitResponse.badgesEarned?.size ?: 0,
                                    earnedBadgeIds = submitResponse.badgesEarned?.map { it.id }?.toSet() ?: emptySet(),
                                )
                                // Backend confirmed — navigate directly to success with real data
                                onBurnSubmitted(
                                    signature,
                                    submitResponse.newStreak ?: (uiState.currentStreak + 1),
                                    java.math.BigDecimal.valueOf(uiState.burnAmount).toPlainString(),
                                    submitResponse.badgesEarned?.firstOrNull()?.name,
                                    submitResponse.badgesEarned?.firstOrNull()?.id,
                                )
                            } else {
                                // All retries failed — pending screen will poll getBurnStatus as fallback
                                // Pass burn/fee amounts so the pending screen can re-submit
                                if (BuildConfig.DEBUG) android.util.Log.w("BurnConfirm", "Backend submit failed after ${SeekerBurnConfig.BACKEND_SUBMIT_MAX_RETRIES} retries", lastError)
                                val burnAmountStr = java.math.BigDecimal.valueOf(uiState.burnAmount).toPlainString()
                                val feeAmountStr = java.math.BigDecimal.valueOf(uiState.feeAmount)
                                    .stripTrailingZeros()
                                    .toPlainString()
                                onBurnSigned(signature, burnAmountStr, feeAmountStr)
                            }
                        } catch (e: Exception) {
                            submitError = e.message ?: "Burn transaction failed"
                        } finally {
                            isSubmitting = false
                        }
                    }
                },
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = colors.primary,
                    contentColor = colors.textOnPrimary,
                ),
                enabled = !isSubmitting && hasAcknowledgedIrreversible,
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = colors.textOnPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Sign & Burn", fontWeight = FontWeight.Bold)
                }
            }
        }

        if (submitError != null) {
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = submitError.orEmpty(),
                style = MaterialTheme.typography.bodySmall,
                color = colors.error,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}
