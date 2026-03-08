package club.seekerburn.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import kotlin.math.sin

// Pixel shape for all cards/buttons — very small radius for that crisp retro look
val PixelShape = RoundedCornerShape(4.dp)

/**
 * Primary action button — pixel-art styled with fire glow and thick border.
 */
@Composable
fun BurnButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false,
    icon: @Composable (() -> Unit)? = null,
) {
    val haptic = LocalHapticFeedback.current
    val colors = SeekerBurnTheme.colors

    // Animated fire glow phase
    val infiniteTransition = rememberInfiniteTransition(label = "btn_fire")
    val firePhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 6.28f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
        ),
        label = "btn_fire_phase",
    )

    val gradientBrush = Brush.horizontalGradient(
        colors = if (enabled && !isLoading) listOf(
            colors.gradientFireStart,
            colors.gradientFireMid,
            colors.gradientFireEnd,
        )
        else listOf(colors.surfaceElevated2, colors.surfaceElevated3),
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .then(
                if (enabled && !isLoading) Modifier.fireGlow(firePhase) else Modifier
            )
            .clip(PixelShape)
            .background(gradientBrush)
            .pixelBorder(
                color = if (enabled) colors.accent else colors.border,
                glowColor = if (enabled) colors.primaryGlow else Color.Transparent,
            )
            .clickable(enabled = enabled && !isLoading) {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = colors.textOnPrimary,
                strokeWidth = 2.5.dp,
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (icon != null) {
                    icon()
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(
                    text = text,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = if (enabled) colors.textOnPrimary else colors.textTertiary,
                )
            }
        }
    }
}

/**
 * Secondary outlined button — pixel border style.
 */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = SeekerBurnTheme.colors

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(46.dp)
            .background(colors.surfaceElevated2, PixelShape)
            .pixelBorder(
                color = if (enabled) colors.primary.copy(alpha = 0.6f) else colors.border,
                glowColor = Color.Transparent,
            )
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = if (enabled) colors.primary else colors.textTertiary,
        )
    }
}

/**
 * Pixel-art card — dark background with retro double border.
 */
@Composable
fun BurnCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(colors.surfaceElevated, PixelShape)
            .pixelBorder(color = colors.border, glowColor = colors.primaryGlow.copy(alpha = 0.08f))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(16.dp),
        content = content,
    )
}

/**
 * Stat key/value row with pixel font for values.
 */
@Composable
fun StatRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color? = null,
) {
    val colors = SeekerBurnTheme.colors

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = colors.textSecondary,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = valueColor ?: colors.textPrimary,
            fontWeight = FontWeight.Bold,
        )
    }
}

/**
 * Animated shimmer loading placeholder with pixel styling.
 */
@Composable
fun ShimmerBox(
    modifier: Modifier = Modifier,
) {
    val colors = SeekerBurnTheme.colors
    val transition = rememberInfiniteTransition(label = "shimmer")
    val shimmerOffset by transition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1000, easing = LinearEasing),
        ),
        label = "shimmer_offset",
    )

    val shimmerBrush = Brush.horizontalGradient(
        colors = listOf(
            colors.shimmer,
            colors.shimmerHighlight,
            colors.shimmer,
        ),
        startX = shimmerOffset * 300f,
        endX = (shimmerOffset + 1f) * 300f,
    )

    Box(
        modifier = modifier
            .clip(PixelShape)
            .background(shimmerBrush)
    )
}

/**
 * Section header — pixel font for title.
 */
@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null,
) {
    val colors = SeekerBurnTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = colors.textPrimary,
            fontWeight = FontWeight.Bold,
        )
        if (action != null) action()
    }
}

/**
 * Pixel dithered divider.
 */
@Composable
fun SubtleDivider(modifier: Modifier = Modifier) {
    PixelDivider(modifier = modifier.padding(vertical = 4.dp))
}
