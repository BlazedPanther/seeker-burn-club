package club.seekerburn.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Pixel-art retro arcade palette — CRT-inspired blue-blacks,
 * vivid brand fire, neon accents, pixel-grade semantic colors.
 */
@Immutable
data class SeekerBurnColors(
    // ── Surfaces (CRT blue-black base) ──
    val surface: Color = Color(0xFF080810),
    val surfaceElevated: Color = Color(0xFF0E0E1A),
    val surfaceElevated2: Color = Color(0xFF161626),
    val surfaceElevated3: Color = Color(0xFF1E1E32),

    // ── Brand (fire) ──
    val primary: Color = Color(0xFFFF6B35),
    val primaryDim: Color = Color(0xFFCC4400),
    val primaryMuted: Color = Color(0xFF8B3A1A),
    val primaryGlow: Color = Color(0x44FF6B35),
    val accent: Color = Color(0xFFFFD740),
    val accentDim: Color = Color(0xFFFFA000),

    // ── Text (CRT phosphor whites) ──
    val secondary: Color = Color(0xFFE0DDD8),
    val textPrimary: Color = Color(0xFFF5F5F0),
    val textSecondary: Color = Color(0xFF9090AA),
    val textTertiary: Color = Color(0xFF505070),
    val textOnPrimary: Color = Color(0xFFFFFFFF),

    // ── Semantic (retro neon) ──
    val success: Color = Color(0xFF4ADE80),
    val successDim: Color = Color(0xFF22C55E),
    val warning: Color = Color(0xFFFFE600),
    val warningDim: Color = Color(0xFFEAB308),
    val error: Color = Color(0xFFFF4444),
    val errorDim: Color = Color(0xFFCC2222),

    // ── Borders & Dividers (pixel-grid lines) ──
    val divider: Color = Color(0xFF252540),
    val border: Color = Color(0xFF3A3A5C),
    val borderSubtle: Color = Color(0xFF1A1A30),

    // ── Pixel accents ──
    val pixelCyan: Color = Color(0xFF22D3EE),
    val pixelMagenta: Color = Color(0xFFE040FB),
    val pixelBlue: Color = Color(0xFF6366F1),

    // ── Overlays ──
    val scrim: Color = Color(0xDD000008),
    val shimmer: Color = Color(0xFF1A1A30),
    val shimmerHighlight: Color = Color(0xFF2A2A48),

    // ── Gradient stops ──
    val gradientOrangeStart: Color = Color(0xFFFF6B35),
    val gradientOrangeEnd: Color = Color(0xFFFFAB00),
    val gradientGoldStart: Color = Color(0xFFFFD740),
    val gradientGoldEnd: Color = Color(0xFFFFC107),
    val gradientFireStart: Color = Color(0xFFFF4500),
    val gradientFireMid: Color = Color(0xFFFF6B35),
    val gradientFireEnd: Color = Color(0xFFFFD740),
    val gradientSurfaceStart: Color = Color(0xFF0E0E1A),
    val gradientSurfaceEnd: Color = Color(0xFF060610),
)

val LocalSeekerBurnColors = staticCompositionLocalOf { SeekerBurnColors() }
