package club.seekerburn.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Pixel-art streak ring — blocky arc segments with retro glow,
 * pixel font center stats, and ember particles at the arc tip.
 */
@Composable
fun StreakRing(
    currentStreak: Int,
    nextMilestone: Int,
    isAtRisk: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val colors = SeekerBurnTheme.colors
    val progress = if (nextMilestone > 0) currentStreak.toFloat() / nextMilestone else 0f
    val clampedProgress = progress.coerceIn(0f, 1f)

    val animatedProgress by animateFloatAsState(
        targetValue = clampedProgress,
        animationSpec = tween(durationMillis = 800, easing = FastOutSlowInEasing),
        label = "streak_progress"
    )

    // Pulsing animation for at-risk state
    val infiniteTransition = rememberInfiniteTransition(label = "risk_pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(700, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "risk_alpha"
    )

    val arcColorStart = when {
        isAtRisk -> colors.warning.copy(alpha = pulseAlpha)
        currentStreak > 0 -> colors.gradientFireStart
        else -> colors.surfaceElevated2
    }
    val arcColorEnd = when {
        isAtRisk -> colors.warningDim.copy(alpha = pulseAlpha)
        currentStreak > 0 -> colors.gradientFireEnd
        else -> colors.surfaceElevated2
    }
    val glowColor = when {
        isAtRisk -> colors.warning.copy(alpha = 0.2f * pulseAlpha)
        currentStreak > 0 -> colors.primaryGlow.copy(alpha = 0.3f)
        else -> Color.Transparent
    }

    val trackColor = colors.surfaceElevated3

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.size(200.dp)
    ) {
        // Fire particles behind the ring
        if (currentStreak > 0) {
            FireParticleEffect(
                modifier = Modifier.fillMaxSize(),
                particleCount = 10,
                intensity = if (isAtRisk) 1.5f else 0.7f,
            )
        }

        Canvas(modifier = Modifier.fillMaxSize().padding(8.dp)) {
            val strokeWidth = 16.dp.toPx()
            val glowStrokeWidth = 26.dp.toPx()
            val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
            val topLeft = Offset(strokeWidth / 2, strokeWidth / 2)
            val glowArcSize = Size(size.width - glowStrokeWidth, size.height - glowStrokeWidth)
            val glowTopLeft = Offset(glowStrokeWidth / 2, glowStrokeWidth / 2)

            // Track (full circle) — darker, more defined
            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Butt), // Butt cap for pixel feel
            )

            // Glow layer (wider, fire-colored)
            if (animatedProgress > 0f) {
                drawArc(
                    color = glowColor,
                    startAngle = -90f,
                    sweepAngle = 360f * animatedProgress,
                    useCenter = false,
                    topLeft = glowTopLeft,
                    size = glowArcSize,
                    style = Stroke(width = glowStrokeWidth, cap = StrokeCap.Butt),
                )
            }

            // Progress arc — fire gradient
            if (animatedProgress > 0f) {
                drawArc(
                    brush = Brush.sweepGradient(
                        colors = listOf(arcColorStart, arcColorEnd, arcColorStart),
                    ),
                    startAngle = -90f,
                    sweepAngle = 360f * animatedProgress,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Butt),
                )
            }

            // Pixel tick marks around the ring (every 30 degrees)
            val cx = size.width / 2
            val cy = size.height / 2
            val outerR = (size.width - strokeWidth) / 2 + strokeWidth / 2 + 2.dp.toPx()
            for (i in 0 until 12) {
                val angle = (i * 30f - 90f) * PI.toFloat() / 180f
                val x = cx + cos(angle) * outerR
                val y = cy + sin(angle) * outerR
                drawRect(
                    color = colors.border,
                    topLeft = Offset(x - 1.5.dp.toPx(), y - 1.5.dp.toPx()),
                    size = Size(3.dp.toPx(), 3.dp.toPx()),
                )
            }
        }

        // Center content — pixel font
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = if (currentStreak > 0) "$currentStreak" else "0",
                style = MaterialTheme.typography.displayLarge.copy(
                    fontFamily = PressStart2P,
                    fontSize = 32.sp,
                    letterSpacing = (-1).sp,
                ),
                color = colors.textPrimary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = when {
                    currentStreak == 0 -> "START"
                    isAtRisk -> "BURN NOW!"
                    else -> "STREAK"
                },
                style = MaterialTheme.typography.labelMedium.copy(
                    fontFamily = PressStart2P,
                    fontSize = 8.sp,
                    letterSpacing = 1.sp,
                ),
                color = if (isAtRisk) colors.warning else colors.textTertiary,
                textAlign = TextAlign.Center,
            )
            if (nextMilestone > 0 && currentStreak > 0 && currentStreak < nextMilestone) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "${nextMilestone - currentStreak} to badge",
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                    color = colors.primary.copy(alpha = 0.8f),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
