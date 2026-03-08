package club.seekerburn.app.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import club.seekerburn.app.R
import club.seekerburn.app.ui.components.*
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import kotlinx.coroutines.launch

data class OnboardingPage(
    val headline: String,
    val body: String,
    val ctaText: String,
)

private val pages = listOf(
    OnboardingPage(
        headline = "BURN.\nBUILD.\nGROW.",
        body = "Seeker Burn Club is the daily commitment layer for the Solana Seeker community.",
        ctaText = "NEXT >>",
    ),
    OnboardingPage(
        headline = "HOW IT\nWORKS",
        body = "Burn at least 1 SKR each day. Keep your streak active across UTC days. Unlock milestone badges as proof of consistency.",
        ctaText = "NEXT >>",
    ),
    OnboardingPage(
        headline = "BURN\nSPIRITS",
        body = "Every badge unlocks a unique pixel creature — your Burn Spirit. 14 trillion+ combinations, no two alike. Claim them as Solana NFTs.",
        ctaText = "NEXT >>",
    ),
    OnboardingPage(
        headline = "ONE\nFAMILY",
        body = "We love Seeker: one family that burns and helps each other grow.",
        ctaText = ">> ENTER <<",
    ),
)

@Composable
fun OnboardingScreen(
    onComplete: () -> Unit,
    authViewModel: club.seekerburn.app.viewmodel.AuthViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val pagerState = rememberPagerState(pageCount = { pages.size })
    val coroutineScope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .scanlineOverlay(alpha = 0.04f)
    ) {
        // Fire particles behind everything
        FireParticleEffect(
            modifier = Modifier.fillMaxSize(),
            particleCount = 20,
            intensity = 0.5f,
        )

        // Skip button
        TextButton(
            onClick = {
                authViewModel.completeOnboarding()
                onComplete()
            },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp)
                .statusBarsPadding(),
        ) {
            Text(
                text = "SKIP",
                style = MaterialTheme.typography.labelMedium,
                color = colors.textSecondary,
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.weight(0.15f))

            // Pager
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.weight(0.6f),
            ) { page ->
                OnboardingPageContent(pages[page])
            }

            // Page indicators — pixel squares instead of circles
            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.padding(vertical = 24.dp),
            ) {
                repeat(pages.size) { index ->
                    val isActive = pagerState.currentPage == index
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .size(if (isActive) 10.dp else 6.dp)
                            .background(
                                if (isActive) colors.primary else colors.textTertiary
                            )
                    )
                }
            }

            // CTA Button
            BurnButton(
                text = pages[pagerState.currentPage].ctaText,
                onClick = {
                    if (pagerState.currentPage < pages.lastIndex) {
                        coroutineScope.launch {
                            pagerState.animateScrollToPage(pagerState.currentPage + 1)
                        }
                    } else {
                        authViewModel.completeOnboarding()
                        onComplete()
                    }
                },
                modifier = Modifier.padding(bottom = 32.dp),
            )
        }
    }
}

@Composable
private fun OnboardingPageContent(page: OnboardingPage) {
    val colors = SeekerBurnTheme.colors
    val pulse = rememberInfiniteTransition(label = "onboarding_pulse")
    val alpha by pulse.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "onboarding_pulse_alpha",
    )

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        // Pixel flame icon with pulsing glow
        Box(
            modifier = Modifier
                .size(88.dp)
                .alpha(alpha)
                .background(colors.primary.copy(alpha = 0.15f))
                .pixelBorder(
                    color = colors.primary.copy(alpha = 0.4f),
                    glowColor = colors.primaryGlow,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.mipmap.ic_launcher_foreground),
                contentDescription = "Seeker Burn",
                modifier = Modifier.size(56.dp),
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        // Headline — Press Start 2P with glitch
        GlitchText(
            text = page.headline,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontFamily = PressStart2P,
                fontSize = 18.sp,
                lineHeight = 32.sp,
            ),
            color = colors.textPrimary,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(modifier = Modifier.height(20.dp))

        Text(
            text = page.body,
            style = MaterialTheme.typography.bodyLarge,
            color = colors.textSecondary,
            textAlign = TextAlign.Center,
            lineHeight = 24.sp,
        )
    }
}
