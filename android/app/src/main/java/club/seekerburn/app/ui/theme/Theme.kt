package club.seekerburn.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Material3 dark color scheme mapped to the pixel-art palette.
 */
private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFFFF6B35),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFF8B3A1A),
    onPrimaryContainer = Color(0xFFFFDACA),
    secondary = Color(0xFFE0DDD8),
    onSecondary = Color(0xFF080810),
    secondaryContainer = Color(0xFF252540),
    background = Color(0xFF080810),
    onBackground = Color(0xFFF5F5F0),
    surface = Color(0xFF080810),
    onSurface = Color(0xFFF5F5F0),
    surfaceVariant = Color(0xFF0E0E1A),
    onSurfaceVariant = Color(0xFF9090AA),
    surfaceContainerHighest = Color(0xFF1E1E32),
    surfaceContainerHigh = Color(0xFF161626),
    surfaceContainer = Color(0xFF0E0E1A),
    surfaceContainerLow = Color(0xFF0A0A14),
    surfaceDim = Color(0xFF080810),
    error = Color(0xFFFF4444),
    onError = Color(0xFFFFFFFF),
    outline = Color(0xFF3A3A5C),
    outlineVariant = Color(0xFF252540),
    inverseSurface = Color(0xFFF5F5F0),
    inverseOnSurface = Color(0xFF080810),
    inversePrimary = Color(0xFF8B3A1A),
)

object SeekerBurnTheme {
    val colors: SeekerBurnColors
        @Composable
        @ReadOnlyComposable
        get() = LocalSeekerBurnColors.current
}

@Composable
fun SeekerBurnTheme(
    content: @Composable () -> Unit
) {
    val burnColors = SeekerBurnColors()

    // Immersive dark status/nav bars — deep CRT black
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val activity = view.context as? Activity ?: return@SideEffect
            val window = activity.window
            window.statusBarColor = burnColors.surface.toArgb()
            window.navigationBarColor = burnColors.surfaceElevated.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }

    CompositionLocalProvider(
        LocalSeekerBurnColors provides burnColors
    ) {
        MaterialTheme(
            colorScheme = DarkColorScheme,
            typography = SeekerBurnTypography,
            content = content
        )
    }
}
