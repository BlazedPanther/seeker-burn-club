package club.seekerburn.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Local pixel-art fallback for badge artwork.
 * Ensures each badge still feels unique if remote SVG loading fails.
 */
@Composable
fun BadgeArtFallback(
    badgeId: String,
    badgeName: String,
    modifier: Modifier = Modifier,
) {
    val seed = badgeId.hashCode()
    val primary = colorFromSeed(seed)
    val secondary = colorFromSeed(seed * 31 + 17)
    val accent = colorFromSeed(seed * 13 + 97)
    val code = badgeCode(badgeId)

    Box(
        modifier = modifier.background(
            Brush.verticalGradient(
                colors = listOf(primary.copy(alpha = 0.9f), secondary.copy(alpha = 0.85f)),
            ),
        ),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cols = 8
            val rows = 8
            val cellW = size.width / cols
            val cellH = size.height / rows
            var bitCursor = seed.toUInt()
            for (y in 0 until rows) {
                for (x in 0 until cols) {
                    // Deterministic mirrored pattern for pixel-art feel.
                    val mirrorX = if (x < cols / 2) x else cols - 1 - x
                    val bit = ((bitCursor shr ((mirrorX + y) % 31)) and 1u) == 1u
                    if (bit) {
                        drawRect(
                            color = accent.copy(alpha = 0.28f),
                            topLeft = androidx.compose.ui.geometry.Offset(x * cellW, y * cellH),
                            size = androidx.compose.ui.geometry.Size(cellW - 1f, cellH - 1f),
                        )
                    }
                    bitCursor = (bitCursor shl 1) or (bitCursor shr 31)
                }
            }
        }

        Text(
            text = code,
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
            fontWeight = FontWeight.Black,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 6.dp),
        )

        Text(
            text = badgeName,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White.copy(alpha = 0.86f),
            textAlign = TextAlign.Center,
            maxLines = 1,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(6.dp),
        )
    }
}

private fun badgeCode(id: String): String {
    val parts = id.split('_')
    if (parts.size < 2) return id.take(4)
    val prefix = when (parts[0]) {
        "STREAK" -> "S"
        "BURN" -> "B"
        else -> parts[0].take(1)
    }
    return prefix + parts[1]
}

private fun colorFromSeed(seed: Int): Color {
    val r = ((seed ushr 16) and 0x7F) + 80
    val g = ((seed ushr 8) and 0x7F) + 80
    val b = (seed and 0x7F) + 80
    return Color(r, g, b)
}
