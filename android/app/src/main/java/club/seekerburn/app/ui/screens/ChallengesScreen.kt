package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.model.ChallengeProgress
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.PixelProgressBar
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.viewmodel.ChallengesViewModel

@Composable
fun ChallengesScreen(
    onBack: () -> Unit,
    viewModel: ChallengesViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .statusBarsPadding(),
    ) {
        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = colors.textPrimary,
                )
            }
            Text(
                text = "Challenges",
                style = MaterialTheme.typography.titleLarge,
                color = colors.textPrimary,
            )
        }

        when {
            uiState.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.primary)
                }
            }
            uiState.error != null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(20.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Failed to load challenges", color = colors.textSecondary)
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(onClick = { viewModel.refresh() }) {
                            Text("Retry")
                        }
                    }
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp),
                ) {
                    Spacer(modifier = Modifier.height(8.dp))

                    // XP Level header
                    BurnCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .background(
                                        brush = Brush.verticalGradient(
                                            listOf(colors.accent, colors.accentDim),
                                        ),
                                        shape = RoundedCornerShape(10.dp),
                                    ),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = "${uiState.level}",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontFamily = PressStart2P,
                                    color = colors.surface,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                )
                            }
                            Spacer(modifier = Modifier.width(14.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = uiState.levelTitle,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = colors.accent,
                                    fontWeight = FontWeight.Bold,
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "${uiState.xp} XP total",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = colors.textSecondary,
                                    fontSize = 10.sp,
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "Level ${uiState.level}",
                                style = MaterialTheme.typography.labelSmall,
                                color = colors.textTertiary,
                                fontSize = 8.sp,
                            )
                            Text(
                                text = "${uiState.xpIntoLevel} / ${uiState.xpToNextLevel} XP",
                                style = MaterialTheme.typography.labelSmall,
                                color = colors.textTertiary,
                                fontSize = 8.sp,
                            )
                            Text(
                                text = "Level ${uiState.level + 1}",
                                style = MaterialTheme.typography.labelSmall,
                                color = colors.textTertiary,
                                fontSize = 8.sp,
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        PixelProgressBar(
                            progress = if (uiState.xpToNextLevel > 0) {
                                uiState.xpIntoLevel.toFloat() / uiState.xpToNextLevel.toFloat()
                            } else 0f,
                            fillColor = colors.accent,
                            blockCount = 24,
                            height = 12.dp,
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Daily Sweep indicator
                    if (uiState.dailySweep) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    color = colors.success.copy(alpha = 0.12f),
                                    shape = RoundedCornerShape(10.dp),
                                )
                                .padding(12.dp),
                        ) {
                            Text(
                                text = "\u2728 DAILY SWEEP \u2014 All daily challenges completed! +500 XP bonus",
                                style = MaterialTheme.typography.labelMedium,
                                color = colors.success,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // Daily Challenges
                    SectionHeader("Daily Challenges")
                    Spacer(modifier = Modifier.height(8.dp))
                    if (uiState.dailyChallenges.isEmpty()) {
                        EmptyMessage("No daily challenges today.")
                    } else {
                        uiState.dailyChallenges.forEach { challenge ->
                            ChallengeCard(challenge = challenge)
                            Spacer(modifier = Modifier.height(10.dp))
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Weekly Challenges
                    SectionHeader("Weekly Challenges")
                    Spacer(modifier = Modifier.height(8.dp))
                    if (uiState.weeklyChallenges.isEmpty()) {
                        EmptyMessage("No weekly challenges this week.")
                    } else {
                        uiState.weeklyChallenges.forEach { challenge ->
                            ChallengeCard(challenge = challenge)
                            Spacer(modifier = Modifier.height(10.dp))
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    val colors = SeekerBurnTheme.colors
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        color = colors.textPrimary,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun EmptyMessage(text: String) {
    val colors = SeekerBurnTheme.colors
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = colors.textTertiary,
    )
}

@Composable
private fun ChallengeCard(challenge: ChallengeProgress) {
    val colors = SeekerBurnTheme.colors
    BurnCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            // Status icon
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .background(
                        color = if (challenge.completed) colors.success.copy(alpha = 0.15f)
                        else colors.surfaceElevated2,
                        shape = RoundedCornerShape(8.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (challenge.completed) "\u2714" else "\uD83D\uDD25",
                    fontSize = 16.sp,
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = challenge.title,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (challenge.completed) colors.success else colors.textPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                    )
                    Text(
                        text = "+${challenge.xpReward} XP",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (challenge.completed) colors.success else colors.accent,
                        fontWeight = FontWeight.Bold,
                        fontSize = 9.sp,
                    )
                }
                if (challenge.description.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = challenge.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textSecondary,
                        fontSize = 10.sp,
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PixelProgressBar(
                        progress = challenge.progressFraction,
                        fillColor = if (challenge.completed) colors.success else colors.primary,
                        blockCount = 16,
                        height = 8.dp,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "${challenge.progress.toInt()} / ${challenge.target.toInt()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.textTertiary,
                        fontSize = 8.sp,
                    )
                }
            }
        }
    }
}
