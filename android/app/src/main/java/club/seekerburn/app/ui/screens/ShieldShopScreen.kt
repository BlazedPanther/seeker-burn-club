package club.seekerburn.app.ui.screens

import androidx.compose.foundation.BorderStroke
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
import club.seekerburn.app.model.ShieldPack
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.PixelProgressBar
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.viewmodel.ShopViewModel
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender

@Composable
fun ShieldShopScreen(
    walletSender: ActivityResultSender,
    onBack: () -> Unit,
    viewModel: ShopViewModel = hiltViewModel(),
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
                text = "Shield Shop",
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
                        Text("Failed to load shop", color = colors.textSecondary)
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

                    // Current shields balance
                    BurnCard {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            BurnIcon(icon = BurnIcons.Snowflake, contentDescription = "Shield", size = 40.dp)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Streak Shields",
                                style = MaterialTheme.typography.titleMedium,
                                color = colors.textPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "${uiState.currentShields}",
                                    style = MaterialTheme.typography.headlineLarge,
                                    fontFamily = PressStart2P,
                                    color = colors.accent,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = " / ${uiState.maxShields}",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = colors.textTertiary,
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            PixelProgressBar(
                                progress = uiState.currentShields.toFloat() / uiState.maxShields.toFloat(),
                                fillColor = colors.success,
                                blockCount = uiState.maxShields,
                                height = 12.dp,
                                modifier = Modifier.fillMaxWidth(0.7f),
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Shields protect your streak when you miss a day.\nOne shield is consumed per missed day.",
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.textSecondary,
                                textAlign = TextAlign.Center,
                                fontSize = 10.sp,
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Currency toggle
                    CurrencyToggle(
                        selected = uiState.selectedCurrency,
                        onToggle = { viewModel.toggleCurrency() },
                    )

                    // Live price indicator
                    if (uiState.priceSource != "fallback") {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = if (uiState.priceSource == "live") "Live prices" else "Cached prices",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (uiState.priceSource == "live") colors.success else colors.textTertiary,
                            fontSize = 9.sp,
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Shield Packs",
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.Bold,
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    // Purchase feedback
                    if (uiState.purchaseSuccess != null) {
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
                                text = "\u2705 ${uiState.purchaseSuccess}",
                                style = MaterialTheme.typography.labelMedium,
                                color = colors.success,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                    }
                    if (uiState.purchaseError != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    color = colors.error.copy(alpha = 0.12f),
                                    shape = RoundedCornerShape(10.dp),
                                )
                                .padding(12.dp),
                        ) {
                            Text(
                                text = "\u274C ${uiState.purchaseError}",
                                style = MaterialTheme.typography.labelMedium,
                                color = colors.error,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                    }

                    // Shield packs
                    val atMax = uiState.currentShields >= uiState.maxShields
                    uiState.packs.forEach { pack ->
                        ShieldPackCard(
                            pack = pack,
                            currency = uiState.selectedCurrency,
                            enabled = !uiState.purchasing && !atMax,
                            purchasing = uiState.purchasing,
                            onBuy = { viewModel.purchaseShield(walletSender, pack) },
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    if (atMax) {
                        Text(
                            text = "You have the maximum number of shields.",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.textTertiary,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun ShieldPackCard(
    pack: ShieldPack,
    currency: String,
    enabled: Boolean,
    purchasing: Boolean,
    onBuy: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    val isSkr = currency == "SKR"

    BurnCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Shield count badge
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .background(
                        brush = Brush.verticalGradient(
                            listOf(colors.success, colors.success.copy(alpha = 0.6f)),
                        ),
                        shape = RoundedCornerShape(12.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    BurnIcon(icon = BurnIcons.Snowflake, contentDescription = "Shield", size = 18.dp)
                    Text(
                        text = "${pack.shields}x",
                        fontFamily = PressStart2P,
                        fontSize = 10.sp,
                        color = colors.textOnPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${pack.shields} Shield${if (pack.shields > 1) "s" else ""}",
                        style = MaterialTheme.typography.titleSmall,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                    if (isSkr) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = colors.success.copy(alpha = 0.2f),
                        ) {
                            Text(
                                text = "10% OFF",
                                style = MaterialTheme.typography.labelSmall,
                                color = colors.success,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(2.dp))
                if (isSkr) {
                    val skrAmount = pack.priceSkrBaseUnits.toLongOrNull()?.let { it / 1_000_000_000.0 } ?: 0.0
                    Text(
                        text = "~${String.format("%.1f", skrAmount)} SKR (~$${"%.2f".format(pack.priceSkrUsd)})",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.primary,
                    )
                } else {
                    Text(
                        text = "~$${String.format("%.0f", pack.priceUsd)} in SOL",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textSecondary,
                    )
                }
            }
            Button(
                onClick = onBuy,
                enabled = enabled,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isSkr) colors.accent else colors.primary,
                    disabledContainerColor = colors.surfaceElevated2,
                ),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            ) {
                if (purchasing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = colors.textOnPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text(
                        text = "BUY",
                        fontFamily = PressStart2P,
                        fontSize = 10.sp,
                        color = colors.textOnPrimary,
                    )
                }
            }
        }
    }
}

@Composable
private fun CurrencyToggle(
    selected: String,
    onToggle: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Pay with:",
            style = MaterialTheme.typography.bodyMedium,
            color = colors.textSecondary,
        )
        Spacer(modifier = Modifier.width(12.dp))
        OutlinedButton(
            onClick = { if (selected != "SOL") onToggle() },
            shape = RoundedCornerShape(topStart = 10.dp, bottomStart = 10.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                containerColor = if (selected == "SOL") colors.primary.copy(alpha = 0.15f) else colors.surface,
            ),
            border = BorderStroke(1.dp, if (selected == "SOL") colors.primary else colors.surfaceElevated2),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
        ) {
            Text(
                text = "SOL",
                fontFamily = PressStart2P,
                fontSize = 9.sp,
                color = if (selected == "SOL") colors.primary else colors.textTertiary,
            )
        }
        OutlinedButton(
            onClick = { if (selected != "SKR") onToggle() },
            shape = RoundedCornerShape(topEnd = 10.dp, bottomEnd = 10.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                containerColor = if (selected == "SKR") colors.accent.copy(alpha = 0.15f) else colors.surface,
            ),
            border = BorderStroke(1.dp, if (selected == "SKR") colors.accent else colors.surfaceElevated2),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
        ) {
            Text(
                text = "SEEKER",
                fontFamily = PressStart2P,
                fontSize = 9.sp,
                color = if (selected == "SKR") colors.accent else colors.textTertiary,
            )
        }
    }
}
