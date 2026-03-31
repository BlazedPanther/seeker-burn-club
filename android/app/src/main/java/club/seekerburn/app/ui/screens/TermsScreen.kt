package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import club.seekerburn.app.ui.components.BurnButton
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.scanlineOverlay
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme

/**
 * Terms of Service acceptance screen shown on first launch before onboarding.
 * User must accept to continue using the app.
 */
@Composable
fun TermsScreen(
    onAccept: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .scanlineOverlay(alpha = 0.04f)
            .navigationBarsPadding()
            .statusBarsPadding(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(48.dp))

            BurnIcon(
                icon = BurnIcons.Flame,
                contentDescription = null,
                size = 48.dp,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "SEEKER\nBURN CLUB",
                fontFamily = PressStart2P,
                fontSize = 18.sp,
                color = colors.primary,
                textAlign = TextAlign.Center,
                lineHeight = 28.sp,
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Scrollable terms content
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
            ) {
                Text(
                    text = "Terms of Use",
                    fontFamily = PressStart2P,
                    fontSize = 11.sp,
                    color = colors.textPrimary,
                )

                Spacer(modifier = Modifier.height(16.dp))

                TermsParagraph(
                    "By using Seeker Burn Club you agree to these terms. " +
                    "Please read them carefully before proceeding."
                )

                TermsHeading("1. Nature of the App")
                TermsParagraph(
                    "Seeker Burn Club is a gamified utility for burning Seeker (SKR) tokens " +
                    "on the Solana blockchain. Burned tokens are permanently destroyed and " +
                    "cannot be recovered. This app is not a financial product, investment " +
                    "platform, or money transmitter."
                )

                TermsHeading("2. No Financial Advice")
                TermsParagraph(
                    "Nothing in this app constitutes financial, investment, or trading advice. " +
                    "You are solely responsible for your decisions to burn tokens. Token burning " +
                    "is an irreversible, deflationary action."
                )

                TermsHeading("3. Wallet & Transactions")
                TermsParagraph(
                    "You connect your own Solana wallet. We never have access to your private keys. " +
                    "All transactions are signed locally on your device and submitted to the " +
                    "Solana blockchain. Transaction fees are paid in SOL and are non-refundable."
                )

                TermsHeading("4. Platform Fee")
                TermsParagraph(
                    "A small percentage of each burn is sent to the Community Treasury. " +
                    "This fee is disclosed before every transaction and is non-refundable."
                )

                TermsHeading("5. Digital Collectibles")
                TermsParagraph(
                    "Burn Spirit NFTs are compressed NFTs (cNFTs) minted on Solana. " +
                    "They are digital collectibles with no guaranteed monetary value. " +
                    "We make no promises regarding secondary market value."
                )

                TermsHeading("6. No Guarantees")
                TermsParagraph(
                    "The app is provided \"as is\" without warranties of any kind. We do not " +
                    "guarantee uptime, availability, or the accuracy of XP, leaderboard, or " +
                    "streak data. Service may be interrupted or discontinued at any time."
                )

                TermsHeading("7. Risk Acknowledgment")
                TermsParagraph(
                    "Blockchain transactions are irreversible. You accept all risks associated " +
                    "with using decentralized applications, including but not limited to: " +
                    "network congestion, smart contract bugs, token price volatility, and loss " +
                    "of funds due to user error."
                )

                TermsHeading("8. Age Requirement")
                TermsParagraph(
                    "You must be at least 18 years old to use this app."
                )

                TermsHeading("9. Privacy")
                TermsParagraph(
                    "We store your public wallet address and app activity data on our servers. " +
                    "We do not collect personal identifying information beyond your wallet address. " +
                    "See our Privacy Policy for details."
                )

                TermsHeading("10. Modification")
                TermsParagraph(
                    "We may update these terms at any time. Continued use of the app after " +
                    "changes constitutes acceptance of the new terms."
                )

                Spacer(modifier = Modifier.height(16.dp))
            }

            // Accept button
            Spacer(modifier = Modifier.height(16.dp))

            BurnButton(
                text = "I ACCEPT — ENTER",
                onClick = onAccept,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "By tapping above you agree to the Terms of Use and Privacy Policy.",
                style = MaterialTheme.typography.labelSmall,
                color = colors.textTertiary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 16.dp),
            )

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun TermsHeading(text: String) {
    val colors = SeekerBurnTheme.colors
    Spacer(modifier = Modifier.height(16.dp))
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
        color = colors.textPrimary,
    )
    Spacer(modifier = Modifier.height(4.dp))
}

@Composable
private fun TermsParagraph(text: String) {
    val colors = SeekerBurnTheme.colors
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = colors.textSecondary,
        lineHeight = 18.sp,
    )
}
