package club.seekerburn.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.ui.components.BurnButton
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils

/**
 * Displayed when a burn transaction fails or times out.
 * Shows error-specific messaging and retry/back actions.
 */
@Composable
fun TransactionFailureScreen(
    errorType: BurnErrorType,
    errorDetail: String?,
    onRetry: () -> Unit,
    onGoBack: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    val (iconRes, title, description) = when (errorType) {
        BurnErrorType.USER_REJECTED -> Triple(
            BurnIcons.Prohibited, "Transaction Cancelled",
            "You declined the transaction in your wallet."
        )
        BurnErrorType.INSUFFICIENT_BALANCE -> Triple(
            BurnIcons.WalletEmpty, "Insufficient Balance",
            "Your SKR balance is too low for this burn. Top up and try again."
        )
        BurnErrorType.INSUFFICIENT_SOL -> Triple(
            BurnIcons.Gas, "Not Enough SOL",
            "You need a small amount of SOL for transaction fees."
        )
        BurnErrorType.NETWORK_ERROR -> Triple(
            BurnIcons.SignalOff, "Network Error",
            "Unable to reach Solana. Check your connection and try again."
        )
        BurnErrorType.TIMEOUT -> Triple(
            BurnIcons.Timer, "Verification Pending",
            "Your transaction was sent to Solana and tokens may have been burned. " +
                "The verification is still processing. Please check your wallet or try verifying again."
        )
        BurnErrorType.ALREADY_BURNED_TODAY -> Triple(
            BurnIcons.Flame, "Already Burned Today",
            "You've already completed your daily burn. Come back tomorrow!"
        )
        BurnErrorType.FROZEN_ACCOUNT -> Triple(
            BurnIcons.Snowflake, "Account Frozen",
            "Your token account is frozen and cannot perform burns."
        )
        BurnErrorType.UNKNOWN -> Triple(
            BurnIcons.AlertTriangle, "Something Went Wrong",
            errorDetail ?: "An unexpected error occurred. Please try again."
        )
    }

    val showRetry = errorType !in listOf(
        BurnErrorType.ALREADY_BURNED_TODAY,
        BurnErrorType.FROZEN_ACCOUNT,
    )

    // Extract signature from errorDetail (format: "sig:<base58>") for TIMEOUT cases
    val txSignature = if (errorType == BurnErrorType.TIMEOUT && errorDetail?.startsWith("sig:") == true) {
        errorDetail.removePrefix("sig:")
    } else null
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .padding(horizontal = 20.dp)
            .statusBarsPadding()
            .navigationBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.height(80.dp))

        // Error icon
        Surface(
            modifier = Modifier.size(100.dp),
            shape = CircleShape,
            color = colors.error.copy(alpha = 0.12f),
        ) {
            Box(contentAlignment = Alignment.Center) {
                BurnIcon(icon = iconRes, contentDescription = title, size = 48.dp)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = colors.error,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = description,
            style = MaterialTheme.typography.bodyLarge,
            color = colors.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 16.dp),
        )

        // Truncated error detail (debug info)
        if (errorDetail != null && errorType == BurnErrorType.UNKNOWN) {
            Spacer(modifier = Modifier.height(16.dp))
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = colors.surfaceElevated,
            ) {
                Text(
                    text = errorDetail.take(200),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                    modifier = Modifier.padding(12.dp),
                    maxLines = 4,
                )
            }
        }

        // Show transaction signature and Solscan link for TIMEOUT
        if (txSignature != null) {
            Spacer(modifier = Modifier.height(16.dp))
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = colors.surfaceElevated,
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "Transaction: ${FormatUtils.truncateSignature(txSignature)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textTertiary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Your burn was sent to Solana. If tokens were deducted, your burn will be credited automatically on your next app visit.",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textSecondary,
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = {
                    val url = "${SeekerBurnConfig.SOLSCAN_TX_URL}$txSignature${SeekerBurnConfig.SOLSCAN_CLUSTER_PARAM}"
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("View on Solscan")
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // Action buttons
        if (showRetry) {
            BurnButton(
                text = "Try Again",
                onClick = onRetry,
                enabled = true,
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

        OutlinedButton(
            onClick = onGoBack,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(16.dp),
        ) {
            Text("Go Back")
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}

/**
 * Types of burn transaction errors for appropriate UI messaging.
 */
enum class BurnErrorType {
    USER_REJECTED,
    INSUFFICIENT_BALANCE,
    INSUFFICIENT_SOL,
    NETWORK_ERROR,
    TIMEOUT,
    ALREADY_BURNED_TODAY,
    FROZEN_ACCOUNT,
    UNKNOWN,
}
