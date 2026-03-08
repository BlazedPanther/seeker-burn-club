package club.seekerburn.app.ui.screens

import android.graphics.BitmapFactory
import android.graphics.Movie
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import club.seekerburn.app.R
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.Silkscreen
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import kotlinx.coroutines.*
import java.net.URL
import kotlin.math.*
import kotlin.random.Random

// ═══════════════════════════════════════════════════════════════════════════════
//  CINEMATIC INTRO SCREEN — "The Awakening"
//  ~3 s of CRT-boot → fire-burst → creatures → logo settle.
//  Fully Canvas-based. Skip-on-tap.
// ═══════════════════════════════════════════════════════════════════════════════

/** 3 creature seeds that generate visually distinct & cool-looking creatures */
private data class CreatureEntry(val seed: String, val badgeId: String)
private val INTRO_CREATURES = listOf(
    CreatureEntry("SBCIntro_Alpha",  "STREAK_30"),
    CreatureEntry("SBCIntro_Bravo",  "BURN_10000"),
    CreatureEntry("SBCIntro_Gamma",  "STREAK_90"),
)

// ── Phase durations (ms) ─────────────────────────────────────────────────────
private const val PHASE_BOOT     = 1200   // CRT boot text
private const val PHASE_BURST    = 600    // Fire burst
private const val PHASE_CREATURE = 1600   // Creatures run across
private const val PHASE_LOGO     = 800    // Logo assembles + settle
private const val PHASE_HOLD     = 400    // Hold with logo before callback
private const val TOTAL_MS       = PHASE_BOOT + PHASE_BURST + PHASE_CREATURE + PHASE_LOGO + PHASE_HOLD

// Timestamps
private const val T_BOOT_END    = PHASE_BOOT
private const val T_BURST_END   = T_BOOT_END + PHASE_BURST
private const val T_CREATURE_END = T_BURST_END + PHASE_CREATURE
private const val T_LOGO_END    = T_CREATURE_END + PHASE_LOGO
// private const val T_TOTAL      = T_LOGO_END + PHASE_HOLD

// ── Colors (raw) ─────────────────────────────────────────────────────────────
private val COL_BG        = Color(0xFF080810)
private val COL_TERMINAL  = Color(0xFF22D3EE) // pixelCyan
private val COL_FIRE_1    = Color(0xFFFF4500)
private val COL_FIRE_2    = Color(0xFFFF6B35)
private val COL_FIRE_3    = Color(0xFFFFD740)
private val COL_ORANGE    = Color(0xFFFF6B35)
private val COL_WHITE     = Color(0xFFF5F5F0)
private val COL_SCANLINE  = Color(0x18FFFFFF)

// ── Boot text lines ──────────────────────────────────────────────────────────
private val BOOT_LINES = listOf(
    "> INITIALIZING BURN PROTOCOL...",
    "> LOADING SOUL REGISTRY...",
    "> CONNECTING TO SOLANA...",
    "> SPIRITS FOUND: ∞",
    "> READY.",
)

// ── Fire particle ────────────────────────────────────────────────────────────
private data class BurstParticle(
    var x: Float, var y: Float,
    var vx: Float, var vy: Float,
    var life: Float, // 1→0
    var maxLife: Float,
    var size: Float,
    var colorPhase: Float,
)

@Composable
fun IntroScreen(
    onFinished: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    val density = LocalDensity.current
    val context = LocalContext.current
    val textMeasurer = rememberTextMeasurer()

    // ── Time state ──────────────────────────────────────────────────────────
    val progress = remember { Animatable(0f) }
    var skipped by remember { mutableStateOf(false) }

    // ── Creature GIFs (loaded async from backend — transparent bg) ──────────
    data class CreatureGif(val movie: Movie?, val data: ByteArray?)
    val creatureGifs = remember { mutableStateListOf<CreatureGif?>(null, null, null) }

    // Preload creature GIFs in background
    LaunchedEffect(Unit) {
        INTRO_CREATURES.forEachIndexed { idx, entry ->
            launch(Dispatchers.IO) {
                try {
                    val url = "${SeekerBurnConfig.BACKEND_URL}/api/v1/creatures/image/${entry.seed}/${entry.badgeId}.gif?transparent=1"
                    val bytes = URL(url).readBytes()
                    @Suppress("DEPRECATION")
                    val movie = Movie.decodeByteArray(bytes, 0, bytes.size)
                    creatureGifs[idx] = CreatureGif(movie, bytes)
                } catch (_: Exception) {
                    // Will use pixel placeholder if load fails
                    creatureGifs[idx] = CreatureGif(null, null)
                }
            }
        }
    }

    // ── Fire burst particles ─────────────────────────────────────────────────
    val burstParticles = remember {
        val rng = Random(42)
        Array(120) {
            val angle = rng.nextFloat() * 2f * PI.toFloat()
            val speed = rng.nextFloat() * 1.8f + 0.5f
            BurstParticle(
                x = 0f, y = 0f,
                vx = cos(angle) * speed,
                vy = sin(angle) * speed,
                life = 1f,
                maxLife = rng.nextFloat() * 0.5f + 0.5f,
                size = rng.nextFloat() * 4f + 2f,
                colorPhase = rng.nextFloat(),
            )
        }
    }

    // Load SBC logo for Canvas drawing (launcher foreground PNG)
    val logoBitmap = remember {
        BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher_foreground)?.asImageBitmap()
    }

    // Animate progress 0→1 over TOTAL_MS
    LaunchedEffect(Unit) {
        progress.animateTo(
            1f,
            animationSpec = tween(durationMillis = TOTAL_MS, easing = LinearEasing),
        )
        if (!skipped) onFinished()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(COL_BG)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) {
                if (!skipped) {
                    skipped = true
                    onFinished()
                }
            },
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val cx = w / 2f
            val cy = h / 2f
            val t = progress.value // 0→1
            val ms = (t * TOTAL_MS).toInt()

            // ── Phase 1: CRT Boot ────────────────────────────────────────
            if (ms < T_BURST_END) {
                val bootT = (ms.toFloat() / T_BOOT_END).coerceIn(0f, 1f)
                drawBootText(textMeasurer, bootT, w, h, if (ms >= T_BOOT_END) {
                    // Fade out during burst
                    1f - ((ms - T_BOOT_END).toFloat() / PHASE_BURST).coerceIn(0f, 1f)
                } else 1f)
            }

            // ── Phase 2: Fire Burst ──────────────────────────────────────
            if (ms in T_BOOT_END..T_CREATURE_END) {
                val burstT = ((ms - T_BOOT_END).toFloat() / PHASE_BURST).coerceIn(0f, 1f)
                drawFireBurst(cx, cy, burstParticles, burstT, min(w, h))
            }

            // ── Phase 3: Creatures ───────────────────────────────────────
            if (ms in T_BURST_END..T_LOGO_END) {
                val creatureT = ((ms - T_BURST_END).toFloat() / PHASE_CREATURE).coerceIn(0f, 1f)
                drawCreatures(creatureGifs.toList(), creatureT, w, h, cx, cy, ms)
            }

            // ── Phase 4: Logo ────────────────────────────────────────────
            if (ms >= T_CREATURE_END) {
                val logoT = ((ms - T_CREATURE_END).toFloat() / PHASE_LOGO).coerceIn(0f, 1f)
                drawLogo(textMeasurer, logoT, w, h, cx, cy, logoBitmap)
            }

            // ── Scanlines (always) ───────────────────────────────────────
            drawScanlines(w, h)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DRAWING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

private fun DrawScope.drawBootText(
    textMeasurer: TextMeasurer,
    bootT: Float,          // 0→1 over PHASE_BOOT
    w: Float, h: Float,
    alpha: Float,
) {
    val lineHeight = 28f
    val startY = h * 0.32f
    val startX = w * 0.08f
    val totalChars = BOOT_LINES.sumOf { it.length }
    val charsToShow = (bootT * totalChars * 1.1f).toInt()

    var charCount = 0
    BOOT_LINES.forEachIndexed { lineIdx, line ->
        val lineCharsVisible = (charsToShow - charCount).coerceIn(0, line.length)
        if (lineCharsVisible > 0) {
            val visibleText = line.substring(0, lineCharsVisible)
            val style = TextStyle(
                fontFamily = PressStart2P,
                fontSize = 9.sp,
                color = COL_TERMINAL.copy(alpha = alpha * 0.9f),
            )
            val result = textMeasurer.measure(AnnotatedString(visibleText), style)
            drawText(result, topLeft = Offset(startX, startY + lineIdx * lineHeight))

            // Cursor blink
            if (lineCharsVisible < line.length && (System.nanoTime() / 300_000_000L) % 2 == 0L) {
                val cursorX = startX + result.size.width
                val cursorY = startY + lineIdx * lineHeight
                drawRect(
                    COL_TERMINAL.copy(alpha = alpha),
                    Offset(cursorX + 2f, cursorY + 2f),
                    Size(8f, 16f),
                )
            }
        }
        charCount += line.length
    }
}

private fun DrawScope.drawFireBurst(
    cx: Float, cy: Float,
    particles: Array<BurstParticle>,
    burstT: Float, // 0→1
    dim: Float,
) {
    // Central flash
    if (burstT < 0.3f) {
        val flashA = (1f - burstT / 0.3f)
        val flashR = dim * 0.15f * burstT / 0.3f
        drawCircle(
            COL_FIRE_3.copy(alpha = flashA * 0.8f),
            radius = flashR,
            center = Offset(cx, cy),
        )
        drawCircle(
            Color.White.copy(alpha = flashA * 0.5f),
            radius = flashR * 0.4f,
            center = Offset(cx, cy),
        )
    }

    // Particles expand outward
    val radius = dim * 0.45f * burstT
    particles.forEach { p ->
        val life = (1f - burstT / p.maxLife).coerceIn(0f, 1f)
        if (life <= 0f) return@forEach
        val px = cx + p.vx * radius
        val py = cy + p.vy * radius
        val col = when {
            p.colorPhase < 0.33f -> COL_FIRE_1
            p.colorPhase < 0.66f -> COL_FIRE_2
            else -> COL_FIRE_3
        }
        val s = p.size * life * (dim / 480f)
        drawRect(col.copy(alpha = life * 0.9f), Offset(px - s / 2, py - s / 2), Size(s, s))
    }
}

private fun DrawScope.drawCreatures(
    gifs: List<Any?>, // CreatureGif?
    creatureT: Float,
    w: Float, h: Float,
    cx: Float, cy: Float,
    ms: Int,
) {
    // 3 creatures run from left to right, staggered entry
    val creatureSize = min(w, h) * 0.22f

    for (i in 0..2) {
        val entryDelay = i * 0.15f // stagger
        val localT = ((creatureT - entryDelay) / (1f - entryDelay)).coerceIn(0f, 1f)
        if (localT <= 0f) continue

        // Path: enter from left → run across center → exit right
        val xPos = -creatureSize + (w + creatureSize * 2f) * easeInOutCubic(localT)
        val yBase = cy + (i - 1) * creatureSize * 0.85f // spread vertically
        // Subtle bounce while running
        val bounce = sin(localT * PI.toFloat() * 6f) * 8f
        val yPos = yBase + bounce

        // Draw creature GIF or pixel fallback
        val entry = gifs.getOrNull(i)
        var drawn = false

        if (entry != null) {
            // Reflection-free approach — use a simple dynamic type check
            try {
                @Suppress("UNCHECKED_CAST")
                val gifData = (entry as? Any)?.let { e ->
                    val movieField = e::class.java.getDeclaredField("movie")
                    movieField.isAccessible = true
                    movieField.get(e) as? Movie
                }
                if (gifData != null) {
                    drawIntoCanvas { canvas ->
                        val nativeCanvas = canvas.nativeCanvas
                        nativeCanvas.save()
                        nativeCanvas.translate(xPos, yPos - creatureSize / 2f)
                        val scale = creatureSize / gifData.width().toFloat()
                        nativeCanvas.scale(scale, scale)
                        gifData.setTime(ms % gifData.duration())
                        gifData.draw(nativeCanvas, 0f, 0f)
                        nativeCanvas.restore()
                    }
                    drawn = true
                }
            } catch (_: Exception) { /* fallback */ }
        }

        if (!drawn) {
            // Pixel creature fallback (simple pixel smiley)
            drawPixelCreatureFallback(xPos, yPos - creatureSize / 2f, creatureSize, i)
        }
    }
}

private fun DrawScope.drawPixelCreatureFallback(
    x: Float, y: Float, size: Float, variant: Int,
) {
    val px = size / 12f
    val col = when (variant) {
        0 -> COL_FIRE_1
        1 -> COL_FIRE_2
        else -> COL_FIRE_3
    }
    // Simple pixel body
    fun dot(gx: Int, gy: Int) =
        drawRect(col, Offset(x + gx * px, y + gy * px), Size(px, px))
    // Body
    for (bx in 3..8) for (by in 3..9) dot(bx, by)
    // Eyes
    drawRect(Color.White, Offset(x + 4 * px, y + 4 * px), Size(px, px))
    drawRect(Color.White, Offset(x + 7 * px, y + 4 * px), Size(px, px))
    // Mouth
    for (mx in 5..6) dot(mx, 7)
    // Legs (animated feel - alternating)
    dot(4, 10); dot(7, 10)
}

private fun DrawScope.drawLogo(
    textMeasurer: TextMeasurer,
    logoT: Float,
    w: Float, h: Float,
    cx: Float, cy: Float,
    logoBitmap: ImageBitmap?,
) {
    // Logo image appears with overshoot scale
    val scale = if (logoT < 0.6f) {
        val t = logoT / 0.6f
        1.15f * easeOutBack(t)
    } else {
        val t = (logoT - 0.6f) / 0.4f
        1.15f - 0.15f * t
    }

    val alpha = (logoT * 3f).coerceIn(0f, 1f)

    // Draw SBC logo image
    if (logoBitmap != null) {
        val logoSize = min(w, h) * 0.35f * scale
        drawContext.canvas.nativeCanvas.save()
        drawContext.canvas.nativeCanvas.translate(cx - logoSize / 2f, cy - logoSize - 8f)
        val paint = android.graphics.Paint().apply {
            this.alpha = (alpha * 255).toInt()
            isFilterBitmap = false // keep pixel-art crisp
        }
        drawContext.canvas.nativeCanvas.drawBitmap(
            android.graphics.Bitmap.createScaledBitmap(
                logoBitmap.asAndroidBitmap(), logoSize.toInt().coerceAtLeast(1), logoSize.toInt().coerceAtLeast(1), false
            ),
            0f, 0f, paint,
        )
        drawContext.canvas.nativeCanvas.restore()
    } else {
        // Fallback: text-based title if bitmap fails to load
        val titleStyle = TextStyle(
            fontFamily = PressStart2P,
            fontSize = 18.sp,
            color = COL_ORANGE.copy(alpha = alpha),
            fontWeight = FontWeight.Bold,
        )
        val titleResult = textMeasurer.measure(AnnotatedString("S · B · C"), titleStyle)
        val titleX = cx - titleResult.size.width / 2f * scale
        val titleY = cy - titleResult.size.height * scale - 8f
        drawContext.canvas.nativeCanvas.save()
        drawContext.canvas.nativeCanvas.translate(titleX, titleY)
        drawContext.canvas.nativeCanvas.scale(scale, scale)
        drawText(titleResult, topLeft = Offset.Zero)
        drawContext.canvas.nativeCanvas.restore()
    }

    // Subtitle
    if (logoT > 0.4f) {
        val subAlpha = ((logoT - 0.4f) / 0.3f).coerceIn(0f, 1f)
        val subStyle = TextStyle(
            fontFamily = Silkscreen,
            fontSize = 12.sp,
            color = COL_WHITE.copy(alpha = subAlpha * 0.8f),
        )
        val subResult = textMeasurer.measure(AnnotatedString("SEEKER BURN CLUB"), subStyle)
        drawText(subResult, topLeft = Offset(cx - subResult.size.width / 2f, cy + 12f))
    }

    // Under-glow ("cinematic")
    if (logoT > 0.2f) {
        val glowA = ((logoT - 0.2f) / 0.5f).coerceIn(0f, 0.25f)
        drawCircle(
            COL_FIRE_2.copy(alpha = glowA),
            radius = w * 0.25f,
            center = Offset(cx, cy),
        )
    }
}

private fun DrawScope.drawScanlines(w: Float, h: Float) {
    var y = 0f
    while (y < h) {
        drawLine(COL_SCANLINE, Offset(0f, y), Offset(w, y), strokeWidth = 1f)
        y += 3f
    }
}

// ── Easing ───────────────────────────────────────────────────────────────────

private fun easeInOutCubic(t: Float): Float =
    if (t < 0.5f) 4f * t * t * t else 1f - (-2f * t + 2f).pow(3) / 2f

private fun easeOutBack(t: Float): Float {
    val c1 = 1.70158f
    val c3 = c1 + 1f
    return 1f + c3 * (t - 1f).pow(3) + c1 * (t - 1f).pow(2)
}
