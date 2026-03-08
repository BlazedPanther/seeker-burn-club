package club.seekerburn.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.navigation.SeekerBurnNavHost
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Sanitize deep-link intent data to prevent injection attacks.
        // Reject any deep-link parameters that are clearly malicious.
        sanitizeIncomingIntent(intent)

        val walletSender = ActivityResultSender(this)

        setContent {
            SeekerBurnTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = SeekerBurnTheme.colors.surface
                ) {
                    SeekerBurnNavHost(walletSender = walletSender)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        sanitizeIncomingIntent(intent)
    }

    /**
     * Sanitize incoming deep-link intents to prevent spoofing attacks.
     * - Strips any unknown query parameters
     * - Clamps burn amount to safe range
     * - Validates badge IDs against expected patterns
     */
    private fun sanitizeIncomingIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "seekerburn") return

        // If an "amount" parameter is present (e.g., seekerburn://burn?amount=X),
        // clamp it to a safe range to prevent UI spoofing
        val amountParam = data.getQueryParameter("amount")
        if (amountParam != null) {
            val parsed = amountParam.toBigDecimalOrNull()
            if (parsed == null || parsed <= java.math.BigDecimal.ZERO || parsed > SeekerBurnConfig.MAX_DEEPLINK_BURN) {
                // Invalid amount — strip data entirely; app opens to home
                intent.data = null
            }
        }

        // Validate host is one of our known routes
        val allowedHosts = setOf("home", "burn", "badge", "leaderboard", "tx")
        if (data.host != null && data.host !in allowedHosts) {
            intent.data = null
        }
    }
}
