package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.model.BadgeDefinition
import club.seekerburn.app.ui.components.*
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme

@Composable
fun BadgesTab(
    earnedBadgeIds: Set<String>,
    onBadgeTap: (String) -> Unit,
    isLoading: Boolean = false,
    error: String? = null,
    onRetry: () -> Unit = {},
) {
    val colors = SeekerBurnTheme.colors

    if (isLoading && earnedBadgeIds.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.surface),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = colors.primary)
        }
        return
    }

    if (error != null && earnedBadgeIds.isEmpty()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.surface),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = "LOAD FAILED",
                style = MaterialTheme.typography.titleMedium,
                color = colors.textSecondary,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = colors.textTertiary,
            )
            Spacer(modifier = Modifier.height(12.dp))
            SecondaryButton(
                text = "RETRY",
                onClick = onRetry,
                modifier = Modifier.width(160.dp),
            )
        }
        return
    }

    val streakBadges = BadgeDefinition.ALL.filter { it.type == club.seekerburn.app.model.BadgeType.STREAK }
    val lifetimeBadges = BadgeDefinition.ALL.filter { it.type == club.seekerburn.app.model.BadgeType.LIFETIME }
    val dailyBadges = BadgeDefinition.ALL.filter { it.type == club.seekerburn.app.model.BadgeType.DAILY }
    val txcountBadges = BadgeDefinition.ALL.filter { it.type == club.seekerburn.app.model.BadgeType.TXCOUNT }
    val perfectBadges = BadgeDefinition.ALL.filter { it.type == club.seekerburn.app.model.BadgeType.PERFECT }
    val earnedCount = BadgeDefinition.ALL.count { it.id in earnedBadgeIds }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .scanlineOverlay(alpha = 0.03f)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .statusBarsPadding(),
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        // Pixel header
        GlitchText(
            text = "BADGES",
            style = MaterialTheme.typography.headlineLarge,
            color = colors.textPrimary,
        )

        Spacer(modifier = Modifier.height(6.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "$earnedCount / ${BadgeDefinition.ALL.size}",
                style = MaterialTheme.typography.bodyMedium,
                color = colors.accent,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "collected",
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textSecondary,
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Pixel progress bar
        PixelProgressBar(
            progress = if (BadgeDefinition.ALL.isEmpty()) 0f else earnedCount.toFloat() / BadgeDefinition.ALL.size,
            fillColor = colors.accent,
            borderColor = colors.border,
            blockCount = 20,
            height = 14.dp,
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Badge sections
        BadgeSection("STREAK", streakBadges, earnedBadgeIds, onBadgeTap)
        BadgeSection("LIFETIME", lifetimeBadges, earnedBadgeIds, onBadgeTap)
        BadgeSection("DAILY VOLUME", dailyBadges, earnedBadgeIds, onBadgeTap)
        BadgeSection("TOTAL BURNS", txcountBadges, earnedBadgeIds, onBadgeTap)
        BadgeSection("PERFECT MONTHS", perfectBadges, earnedBadgeIds, onBadgeTap)

        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun BadgeSection(
    title: String,
    badges: List<BadgeDefinition>,
    earnedIds: Set<String>,
    onBadgeTap: (String) -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    val sectionEarned = badges.count { it.id in earnedIds }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = colors.primary,
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "$sectionEarned/${badges.size}",
            style = MaterialTheme.typography.bodySmall,
            color = colors.textTertiary,
        )
        Spacer(modifier = Modifier.weight(1f))
        // Thin accent line
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            colors.primary.copy(alpha = 0.4f),
                            Color.Transparent,
                        ),
                    ),
                ),
        )
    }

    Spacer(modifier = Modifier.height(12.dp))

    BadgeGrid(
        badges = badges,
        earnedIds = earnedIds,
        onBadgeTap = onBadgeTap,
    )

    Spacer(modifier = Modifier.height(28.dp))
}

@Composable
private fun BadgeGrid(
    badges: List<BadgeDefinition>,
    earnedIds: Set<String>,
    onBadgeTap: (String) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.heightIn(max = 800.dp),
        userScrollEnabled = false,
    ) {
        items(badges, key = { it.id }) { badge ->
            BadgeTile(
                badge = badge,
                isEarned = badge.id in earnedIds,
                onTap = { onBadgeTap(badge.id) },
            )
        }
    }
}

@Composable
private fun BadgeTile(
    badge: BadgeDefinition,
    isEarned: Boolean,
    onTap: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    val tileShape = RoundedCornerShape(12.dp)

    // Earned badges get a warm glow border, locked badges are subtle
    val borderBrush = if (isEarned) {
        Brush.linearGradient(
            colors = listOf(
                colors.primary.copy(alpha = 0.8f),
                colors.accent.copy(alpha = 0.6f),
                colors.primary.copy(alpha = 0.8f),
            ),
        )
    } else {
        Brush.linearGradient(
            colors = listOf(
                colors.border.copy(alpha = 0.25f),
                colors.border.copy(alpha = 0.15f),
            ),
        )
    }

    val bgBrush = if (isEarned) {
        Brush.verticalGradient(
            colors = listOf(
                colors.surfaceElevated2,
                colors.surfaceElevated,
            ),
        )
    } else {
        Brush.verticalGradient(
            colors = listOf(
                colors.surfaceElevated.copy(alpha = 0.6f),
                colors.surface.copy(alpha = 0.8f),
            ),
        )
    }

    Box(
        modifier = Modifier
            .clip(tileShape)
            .background(bgBrush, tileShape)
            .border(width = if (isEarned) 1.5.dp else 0.5.dp, brush = borderBrush, shape = tileShape)
            .then(
                if (isEarned) {
                    Modifier.drawBehind {
                        // Subtle outer glow for earned badges
                        drawRoundRect(
                            color = colors.primary.copy(alpha = 0.12f),
                            cornerRadius = CornerRadius(14.dp.toPx()),
                            style = Stroke(width = 4.dp.toPx()),
                        )
                    }
                } else Modifier
            )
            .clickable(onClick = onTap)
            .padding(8.dp),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth(),
        ) {
            // Badge image with rounded clipping
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        if (isEarned) colors.surface.copy(alpha = 0.5f)
                        else colors.surface.copy(alpha = 0.7f),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                val context = LocalContext.current
                SubcomposeAsyncImage(
                    model = ImageRequest.Builder(context)
                        .data("${SeekerBurnConfig.BACKEND_URL}/api/v1/badges/image/${badge.id}.svg")
                        .crossfade(true)
                        .build(),
                    contentDescription = badge.name,
                    modifier = Modifier
                        .fillMaxSize()
                        .alpha(if (isEarned) 1f else 0.4f),
                    loading = {
                        BadgeArtFallback(
                            badgeId = badge.id,
                            badgeName = badge.name,
                            modifier = Modifier.fillMaxSize(),
                        )
                    },
                    error = {
                        BadgeArtFallback(
                            badgeId = badge.id,
                            badgeName = badge.name,
                            modifier = Modifier.fillMaxSize(),
                        )
                    },
                )

                // Locked overlay — frosted glass effect
                if (!isEarned) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.radialGradient(
                                    colors = listOf(
                                        colors.surface.copy(alpha = 0.45f),
                                        colors.surface.copy(alpha = 0.65f),
                                    ),
                                ),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Lock,
                            contentDescription = "Locked",
                            tint = colors.textTertiary.copy(alpha = 0.7f),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }

                // Earned checkmark overlay — bottom-end
                if (isEarned) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(3.dp),
                        contentAlignment = Alignment.BottomEnd,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CheckCircle,
                            contentDescription = "Earned",
                            tint = colors.success,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Badge name
            Text(
                text = badge.name,
                style = MaterialTheme.typography.labelSmall,
                color = if (isEarned) colors.textPrimary else colors.textTertiary,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontSize = 10.sp,
                fontWeight = if (isEarned) FontWeight.Bold else FontWeight.Normal,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
