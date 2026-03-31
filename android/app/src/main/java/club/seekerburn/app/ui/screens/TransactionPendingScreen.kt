package club.seekerburn.app.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.data.api.SeekerBurnApi
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.util.FormatUtils
import club.seekerburn.app.ui.theme.SeekerBurnTheme

/**
 * Full-screen overlay while burn transaction is being processed.
 *
 * Safety-net architecture:
 * 1. First polls GET /burn/status/:sig — succeeds if the initial POST /burn/submit recorded the burn.
 * 2. If status returns 404 (burn not in DB), calls status with ?retryVerify=true to check on-chain.
 * 3. If on-chain confirms the tx exists (202 ON_CHAIN_NOT_RECORDED), re-POSTs /burn/submit
 *    which triggers full on-chain verification with internal RPC retries.
 * 4. Only shows "timeout" if ALL mechanisms fail after TX_CONFIRM_MAX_POLLS attempts.
 *
 * Because the backend guards against DUPLICATE_SIGNATURE, re-submitting is always safe/idempotent.
 */
@Composable
fun TransactionPendingScreen(
    signature: String,
    burnAmount: String? = null,
    feeAmount: String? = null,
    onConfirmed: (burnAmount: String, newStreak: Int, badgeEarned: String?, badgeEarnedId: String?) -> Unit,
    onTimeout: () -> Unit,
    api: SeekerBurnApi = hiltViewModel<TransactionPendingHelper>().api,
) {
    val colors = SeekerBurnTheme.colors

    // Pulsing flame animation
    val infiniteTransition = rememberInfiniteTransition(label = "flame_pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.9f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = EaseInOutCubic),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "flame_scale",
    )
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.7f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = EaseInOutCubic),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "flame_alpha",
    )

    // Real polling — checks backend status every TX_CONFIRM_POLL_INTERVAL_MS
    var elapsedSeconds by remember { mutableIntStateOf(0) }
    var statusText by remember { mutableStateOf("Submitting to Solana…") }

    LaunchedEffect(signature) {
        val maxPolls = SeekerBurnConfig.TX_CONFIRM_MAX_POLLS
        val pollInterval = SeekerBurnConfig.TX_CONFIRM_POLL_INTERVAL_MS
        var pollCount = 0
        var resubmitAttempted = false

        while (pollCount < maxPolls) {
            kotlinx.coroutines.delay(pollInterval)
            elapsedSeconds = ((pollCount + 1) * pollInterval / 1000).toInt()
            pollCount++

            try {
                val burnStatus = api.getBurnStatus(signature)
                when (burnStatus.status.uppercase()) {
                    "VERIFIED" -> {
                        statusText = "Confirmed!"
                        kotlinx.coroutines.delay(SeekerBurnConfig.CONFIRM_SUCCESS_PAUSE_MS)
                        onConfirmed(
                            burnStatus.burnAmount ?: "1.00",
                            burnStatus.newStreak ?: 1,
                            burnStatus.badgeEarned?.name,
                            burnStatus.badgeEarned?.id,
                        )
                        return@LaunchedEffect
                    }
                    "FAILED", "REJECTED" -> {
                        onTimeout()
                        return@LaunchedEffect
                    }
                    // 202 ON_CHAIN_NOT_RECORDED — tx is on-chain but not in DB yet.
                    // The client should re-POST /burn/submit.
                    "ON_CHAIN_NOT_RECORDED" -> {
                        statusText = "Transaction found on-chain, recording…"
                        if (!resubmitAttempted && burnAmount != null && feeAmount != null) {
                            resubmitAttempted = true
                            try {
                                val resp = api.submitBurn(
                                    club.seekerburn.app.model.BurnSubmitRequest(
                                        signature = signature,
                                        burnAmount = burnAmount,
                                        feeAmount = feeAmount,
                                    )
                                )
                                statusText = "Confirmed!"
                                kotlinx.coroutines.delay(SeekerBurnConfig.CONFIRM_SUCCESS_PAUSE_MS)
                                onConfirmed(
                                    burnAmount,
                                    resp.newStreak ?: 1,
                                    resp.badgesEarned?.firstOrNull()?.name,
                                    resp.badgesEarned?.firstOrNull()?.id,
                                )
                                return@LaunchedEffect
                            } catch (_: Exception) {
                                // Will retry on next poll cycle
                                statusText = "Recording burn… retrying…"
                            }
                        }
                    }
                    else -> {
                        statusText = "Waiting for confirmation…"
                    }
                }
            } catch (_: Exception) {
                // 404 or network error — try retryVerify on-chain check after a few polls
                if (pollCount >= 3 && !resubmitAttempted) {
                    statusText = "Checking on-chain status…"
                    // The next poll will use retryVerify=true via getBurnStatusRetry
                    try {
                        val retryResp = api.getBurnStatusRetry(signature)
                        if (retryResp.status.uppercase() == "VERIFIED") {
                            statusText = "Confirmed!"
                            kotlinx.coroutines.delay(SeekerBurnConfig.CONFIRM_SUCCESS_PAUSE_MS)
                            onConfirmed(
                                retryResp.burnAmount ?: "1.00",
                                retryResp.newStreak ?: 1,
                                retryResp.badgeEarned?.name,
                                retryResp.badgeEarned?.id,
                            )
                            return@LaunchedEffect
                        } else if (retryResp.status.uppercase() == "ON_CHAIN_NOT_RECORDED" && burnAmount != null && feeAmount != null) {
                            resubmitAttempted = true
                            try {
                                val resp = api.submitBurn(
                                    club.seekerburn.app.model.BurnSubmitRequest(
                                        signature = signature,
                                        burnAmount = burnAmount,
                                        feeAmount = feeAmount,
                                    )
                                )
                                statusText = "Confirmed!"
                                kotlinx.coroutines.delay(SeekerBurnConfig.CONFIRM_SUCCESS_PAUSE_MS)
                                onConfirmed(
                                    burnAmount,
                                    resp.newStreak ?: 1,
                                    resp.badgesEarned?.firstOrNull()?.name,
                                    resp.badgesEarned?.firstOrNull()?.id,
                                )
                                return@LaunchedEffect
                            } catch (_: Exception) {
                                statusText = "Recording burn… retrying…"
                            }
                        }
                    } catch (_: Exception) {
                        statusText = "Checking status…"
                    }
                } else {
                    statusText = "Checking status…"
                }
            }
        }

        // Exhausted all polls — last-ditch: attempt one final re-submit before giving up
        if (burnAmount != null && feeAmount != null) {
            try {
                statusText = "Final verification attempt…"
                val resp = api.submitBurn(
                    club.seekerburn.app.model.BurnSubmitRequest(
                        signature = signature,
                        burnAmount = burnAmount,
                        feeAmount = feeAmount,
                    )
                )
                statusText = "Confirmed!"
                kotlinx.coroutines.delay(SeekerBurnConfig.CONFIRM_SUCCESS_PAUSE_MS)
                onConfirmed(
                    burnAmount,
                    resp.newStreak ?: 1,
                    resp.badgesEarned?.firstOrNull()?.name,
                    resp.badgesEarned?.firstOrNull()?.id,
                )
                return@LaunchedEffect
            } catch (_: Exception) {
                // truly exhausted
            }
        }

        onTimeout()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .statusBarsPadding()
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        // Animated flame
        Box(
            modifier = Modifier
                .size(120.dp)
                .scale(scale),
            contentAlignment = Alignment.Center,
        ) {
            Surface(
                modifier = Modifier.size(120.dp),
                shape = CircleShape,
                color = colors.primary.copy(alpha = 0.15f * alpha),
            ) {}
            BurnIcon(
                icon = BurnIcons.FlameLarge,
                contentDescription = "Burning",
                size = 64.dp,
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        Text(
            text = "Burning…",
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            ),
            color = colors.textPrimary,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = statusText,
            style = MaterialTheme.typography.bodyLarge,
            color = colors.textSecondary,
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Progress
        LinearProgressIndicator(
            modifier = Modifier
                .width(200.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = colors.primary,
            trackColor = colors.surfaceElevated,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Elapsed: ${elapsedSeconds}s",
            style = MaterialTheme.typography.bodySmall,
            color = colors.textTertiary,
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Truncated signature
        val displaySig = FormatUtils.truncateSignature(signature)

        Text(
            text = "Tx: $displaySig",
            style = MaterialTheme.typography.bodySmall,
            color = colors.textTertiary,
            textAlign = TextAlign.Center,
        )
    }
}
