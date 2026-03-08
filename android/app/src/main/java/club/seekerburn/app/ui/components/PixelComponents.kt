package club.seekerburn.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import kotlin.math.sin
import kotlin.random.Random

// ──────────────────────────────────────────────────────────
//  1. PIXEL BORDER — double-line retro border drawn on Canvas
// ──────────────────────────────────────────────────────────

/**
 * Draws a pixel-art double border around the content (outer bright, inner dim).
 */
fun Modifier.pixelBorder(
    color: Color = Color(0xFF3A3A5C),
    glowColor: Color = Color(0x22FF6B35),
    borderWidth: Dp = 2.dp,
) = this.drawWithContent {
    drawContent()
    val bw = borderWidth.toPx()
    // Outer glow line
    drawRect(
        color = glowColor,
        topLeft = Offset.Zero,
        size = size,
        style = androidx.compose.ui.graphics.drawscope.Stroke(width = bw * 2)
    )
    // Main border
    drawRect(
        color = color,
        topLeft = Offset(bw / 2, bw / 2),
        size = Size(size.width - bw, size.height - bw),
        style = androidx.compose.ui.graphics.drawscope.Stroke(width = bw)
    )
    // Inner highlight (top + left)
    drawLine(
        color = color.copy(alpha = 0.5f),
        start = Offset(bw * 2, bw * 2),
        end = Offset(size.width - bw * 2, bw * 2),
        strokeWidth = 1f
    )
    drawLine(
        color = color.copy(alpha = 0.5f),
        start = Offset(bw * 2, bw * 2),
        end = Offset(bw * 2, size.height - bw * 2),
        strokeWidth = 1f
    )
}

// ──────────────────────────────────────────────────────────
//  2. FIRE PARTICLE EFFECT — floating embers
// ──────────────────────────────────────────────────────────

private data class FireParticle(
    var x: Float,
    var y: Float,
    var size: Float,
    var alpha: Float,
    var speed: Float,
    var drift: Float,
    var color: Color,
    var life: Float,
    var maxLife: Float,
)

/**
 * Animated fire particle overlay — small pixel squares float upward.
 * Frame-accurate via withFrameNanos; one State write per frame avoids
 * the per-element recomposition overhead of mutableStateListOf.
 */
@Composable
fun FireParticleEffect(
    modifier: Modifier = Modifier,
    particleCount: Int = 12,
    intensity: Float = 1f,
) {
    val colors = SeekerBurnTheme.colors
    val fireColors = remember {
        listOf(
            colors.gradientFireStart,
            colors.gradientFireMid,
            colors.gradientFireEnd,
            colors.accent,
        )
    }

    // Plain array — mutations are not observed, so no spurious recompositions.
    val particles = remember(particleCount) {
        Array(particleCount) { createParticle(fireColors, intensity) }
    }

    // A single Long state updated once per frame drives Canvas redraw.
    var frameTick by remember { mutableLongStateOf(0L) }

    LaunchedEffect(Unit) {
        var lastNanos = 0L
        while (true) {
            withFrameNanos { nanos ->
                val dt = if (lastNanos == 0L) 0.016f
                         else ((nanos - lastNanos) / 1_000_000_000f).coerceIn(0f, 0.05f)
                lastNanos = nanos
                for (i in particles.indices) {
                    val p = particles[i]
                    p.y -= p.speed * intensity * dt * 60f
                    p.x += sin(p.life * 3.0).toFloat() * p.drift
                    p.life += dt
                    p.alpha = ((1f - p.life / p.maxLife) * 0.85f).coerceIn(0f, 1f)
                    if (p.life >= p.maxLife || p.alpha <= 0f) {
                        particles[i] = createParticle(fireColors, intensity)
                    }
                }
                frameTick = nanos
            }
        }
    }

    Canvas(modifier = modifier.clipToBounds()) {
        // Reading frameTick here binds this draw scope to the per-frame invalidation.
        @Suppress("UNUSED_EXPRESSION") frameTick
        particles.forEach { p ->
            val px = p.x * size.width
            val py = p.y * size.height
            val pSize = p.size * this.density
            drawRect(
                color = p.color.copy(alpha = p.alpha),
                topLeft = Offset(px - pSize / 2, py - pSize / 2),
                size = Size(pSize, pSize),
            )
        }
    }
}

private fun createParticle(colors: List<Color>, intensity: Float): FireParticle {
    return FireParticle(
        x = Random.nextFloat(),
        y = 0.7f + Random.nextFloat() * 0.3f,
        size = (2f + Random.nextFloat() * 4f) * intensity,
        alpha = 0.6f + Random.nextFloat() * 0.4f,
        speed = (0.005f + Random.nextFloat() * 0.015f) * intensity,
        drift = (Random.nextFloat() - 0.5f) * 0.003f,
        color = colors[Random.nextInt(colors.size)],
        life = 0f,
        maxLife = 1.5f + Random.nextFloat() * 2f,
    )
}

// ──────────────────────────────────────────────────────────
//  3. CRT SCANLINE OVERLAY
// ──────────────────────────────────────────────────────────

/**
 * Subtle CRT scanline overlay — draws semi-transparent horizontal lines.
 */
fun Modifier.scanlineOverlay(
    lineSpacing: Dp = 3.dp,
    alpha: Float = 0.06f,
) = this.drawWithContent {
    drawContent()
    val spacePx = lineSpacing.toPx()
    var y = 0f
    while (y < size.height) {
        drawLine(
            color = Color.Black.copy(alpha = alpha),
            start = Offset(0f, y),
            end = Offset(size.width, y),
            strokeWidth = 1f,
        )
        y += spacePx
    }
}

// ──────────────────────────────────────────────────────────
//  4. PIXEL PROGRESS BAR — block-by-block fill
// ──────────────────────────────────────────────────────────

/**
 * Retro block-fill progress bar — fills with small squares.
 */
@Composable
fun PixelProgressBar(
    progress: Float,
    modifier: Modifier = Modifier,
    fillColor: Color = SeekerBurnTheme.colors.primary,
    trackColor: Color = SeekerBurnTheme.colors.surfaceElevated2,
    borderColor: Color = SeekerBurnTheme.colors.border,
    blockCount: Int = 20,
    height: Dp = 14.dp,
) {
    val animatedProgress by animateFloatAsState(
        targetValue = progress.coerceIn(0f, 1f),
        animationSpec = tween(600, easing = FastOutSlowInEasing),
        label = "pixel_progress",
    )
    val filledBlocks = (animatedProgress * blockCount).toInt()

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
    ) {
        val bw = 2f
        // Track background
        drawRect(color = trackColor, topLeft = Offset.Zero, size = size)
        // Border
        drawRect(
            color = borderColor,
            topLeft = Offset.Zero,
            size = size,
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = bw)
        )

        val blockGap = 2f
        val totalGap = blockGap * (blockCount + 1)
        val blockW = (size.width - totalGap - bw * 2) / blockCount
        val blockH = size.height - bw * 2 - blockGap * 2

        for (i in 0 until blockCount) {
            val x = bw + blockGap + i * (blockW + blockGap)
            val y = bw + blockGap
            val color = if (i < filledBlocks) fillColor else trackColor.copy(alpha = 0.4f)
            drawRect(
                color = color,
                topLeft = Offset(x, y),
                size = Size(blockW, blockH),
            )
        }
    }
}

// ──────────────────────────────────────────────────────────
//  5. PIXEL DIVIDER — dithered / dotted line
// ──────────────────────────────────────────────────────────

/**
 * Pixel-art dithered divider — alternating dots.
 */
@Composable
fun PixelDivider(
    modifier: Modifier = Modifier,
    color: Color = SeekerBurnTheme.colors.border,
) {
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(2.dp)
    ) {
        val dotSize = 2f
        var x = 0f
        var on = true
        while (x < size.width) {
            if (on) {
                drawRect(
                    color = color,
                    topLeft = Offset(x, 0f),
                    size = Size(dotSize, dotSize),
                )
            }
            x += dotSize * 2
            on = !on
        }
    }
}

// ──────────────────────────────────────────────────────────
//  6. GLITCH TEXT — RGB-shift effect on text
// ──────────────────────────────────────────────────────────

/**
 * Text with a subtle, intermittent RGB-shift glitch effect.
 */
@Composable
fun GlitchText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = SeekerBurnTheme.colors.textPrimary,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.headlineMedium,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "glitch")
    val glitchPhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 100f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = LinearEasing),
        ),
        label = "glitch_phase",
    )

    // Glitch only in short windows
    val isGlitching = (glitchPhase % 100f) in 45f..48f || (glitchPhase % 100f) in 72f..74f
    val offsetX = if (isGlitching) ((glitchPhase * 7.3f) % 4f - 2f).dp else 0.dp

    Box(modifier = modifier) {
        if (isGlitching) {
            // Cyan offset
            Text(
                text = text,
                style = style,
                color = SeekerBurnTheme.colors.pixelCyan.copy(alpha = 0.5f),
                modifier = Modifier.offset(x = offsetX, y = (-1).dp),
            )
            // Magenta offset
            Text(
                text = text,
                style = style,
                color = SeekerBurnTheme.colors.pixelMagenta.copy(alpha = 0.3f),
                modifier = Modifier.offset(x = -offsetX, y = 1.dp),
            )
        }
        Text(
            text = text,
            style = style,
            color = color,
        )
    }
}

// ──────────────────────────────────────────────────────────
//  9. ANIMATED FIRE GLOW BORDER
// ──────────────────────────────────────────────────────────

/**
 * Animated cycling fire glow around the element — perfect for the burn CTA.
 */
fun Modifier.fireGlow(
    phase: Float,
    intensity: Float = 1f,
): Modifier = this.drawWithContent {
    // Draw fire glow behind content
    val glowSize = 8.dp.toPx() * intensity
    val alpha = (0.15f + sin(phase * 2f) * 0.1f).coerceIn(0f, 0.3f) * intensity

    drawRect(
        brush = Brush.verticalGradient(
            colors = listOf(
                Color(0xFFFF4500).copy(alpha = alpha),
                Color(0xFFFF6B35).copy(alpha = alpha * 0.7f),
                Color(0xFFFFD740).copy(alpha = alpha * 0.4f),
                Color.Transparent,
            ),
        ),
        topLeft = Offset(-glowSize, -glowSize),
        size = Size(size.width + glowSize * 2, size.height + glowSize * 2),
    )
    drawContent()
}
