package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.scanlineOverlay
import club.seekerburn.app.ui.theme.SeekerBurnTheme

@Composable
fun BattleArenaTab() {
    val colors = SeekerBurnTheme.colors

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .scanlineOverlay(),
        contentAlignment = Alignment.Center,
    ) {
        BurnCard(
            modifier = Modifier
                .padding(horizontal = 32.dp)
                .alpha(0.5f),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                BurnIcon(
                    icon = BurnIcons.Swords,
                    contentDescription = "Battle Arena",
                    size = 48.dp,
                )
                Text(
                    text = "Battle Arena",
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = colors.textSecondary,
                )
                Box(
                    modifier = Modifier
                        .background(
                            color = colors.primary.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(8.dp),
                        )
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = "COMING SOON",
                        style = MaterialTheme.typography.labelLarge.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 2.sp,
                        ),
                        color = colors.primary.copy(alpha = 0.7f),
                    )
                }
                Text(
                    text = "Compete against other burners.\nMore details dropping soon.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textTertiary,
                    textAlign = TextAlign.Center,
                    lineHeight = 20.sp,
                )
            }
        }
    }
}
