package club.seekerburn.app.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.R
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.ui.components.*
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils
import club.seekerburn.app.viewmodel.AuthState
import club.seekerburn.app.viewmodel.GlobalStatsViewModel
import club.seekerburn.app.viewmodel.HomeViewModel
import kotlinx.coroutines.launch
import club.seekerburn.app.ui.goals.GoalsEngine
import java.text.NumberFormat
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.util.Locale
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import coil.compose.SubcomposeAsyncImage
import coil.decode.ImageDecoderDecoder
import coil.request.ImageRequest
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.delay
import java.time.temporal.IsoFields

@Composable
fun HomeTab(
    onBurnTap: () -> Unit,
    walletAddress: String?,
    authState: AuthState,
    onConnectWallet: () -> Unit,
    onDisconnectWallet: () -> Unit = {},
    onNavigateToBadgeDetail: (String) -> Unit = {},
    onNavigateToTreasury: () -> Unit = {},
    onNavigateToPerks: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
    globalStatsViewModel: GlobalStatsViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val uiState by viewModel.uiState.collectAsState()
    val globalState by globalStatsViewModel.uiState.collectAsState()
    val isConnecting = authState is AuthState.Connecting || authState is AuthState.Signing || authState is AuthState.Verifying
    val numberFormat = remember { NumberFormat.getNumberInstance(Locale.US) }
    val lifecycleOwner = LocalLifecycleOwner.current

    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()

    // Observe one-shot events from HomeViewModel
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is club.seekerburn.app.viewmodel.HomeEvent.PreflightPassed -> onBurnTap()
                is club.seekerburn.app.viewmodel.HomeEvent.AlreadyBurnedToday -> Unit
                is club.seekerburn.app.viewmodel.HomeEvent.TreasuryVerificationFailed ->
                    snackbarHostState.showSnackbar("Treasury verification failed. Try again later.")
                is club.seekerburn.app.viewmodel.HomeEvent.Error ->
                    snackbarHostState.showSnackbar(event.message)
            }
        }
    }

    // Keep Home data fresh while app is open so weekly quests and achievements stay current.
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000L)
            viewModel.refresh()
            globalStatsViewModel.refresh()
        }
    }

    // Force refresh whenever user returns to the screen/app.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refresh()
                globalStatsViewModel.refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Box(modifier = Modifier.fillMaxSize()) {

    @OptIn(ExperimentalMaterial3Api::class)
    PullToRefreshBox(
        isRefreshing = uiState.isLoading,
        onRefresh = {
            viewModel.refresh()
            globalStatsViewModel.refresh()
        },
        modifier = Modifier.fillMaxSize(),
    ) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.surface)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .statusBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(modifier = Modifier.height(12.dp))

        // ── Top Bar: Wallet Connect ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Brand mark — actual SBC launcher logo
            Image(
                painter = painterResource(R.mipmap.ic_launcher_foreground),
                contentDescription = "Seeker Burn",
                modifier = Modifier.size(36.dp),
            )

            if (walletAddress.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .background(colors.primary, PixelShape)
                        .pixelBorder(
                            color = colors.accent,
                            glowColor = colors.primaryGlow,
                            borderWidth = 1.5.dp,
                        )
                        .clickable(enabled = !isConnecting, onClick = onConnectWallet)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    if (isConnecting) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(12.dp),
                                color = colors.textOnPrimary,
                                strokeWidth = 2.dp,
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("CONNECTING", style = MaterialTheme.typography.labelMedium, color = colors.textOnPrimary)
                        }
                    } else {
                        Text("CONNECT", style = MaterialTheme.typography.labelLarge, color = colors.textOnPrimary)
                    }
                }
            } else {
                val label = FormatUtils.truncateAddress(walletAddress)
                var showMenu by remember { mutableStateOf(false) }
                Box {
                    Box(
                        modifier = Modifier
                            .background(colors.surfaceElevated, PixelShape)
                            .pixelBorder(
                                color = colors.success.copy(alpha = 0.5f),
                                glowColor = Color.Transparent,
                                borderWidth = 1.5.dp,
                            )
                            .clickable { showMenu = true }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            // Pixel dot instead of circle
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .background(colors.success),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(label, style = MaterialTheme.typography.labelMedium, color = colors.textPrimary)
                        }
                    }
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("Disconnect", color = colors.error) },
                            onClick = {
                                showMenu = false
                                onDisconnectWallet()
                            },
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // ── Hero: Streak Ring ──
        StreakRing(
            currentStreak = uiState.currentStreak,
            nextMilestone = uiState.nextMilestone,
            isAtRisk = uiState.isStreakAtRisk,
        )

        // Streak lost banner
        if (uiState.streakBroken && uiState.previousStreak > 0) {
            Spacer(modifier = Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.error.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "\uD83D\uDD25 You lost your streak!",
                        style = MaterialTheme.typography.labelMedium,
                        color = colors.error,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Your ${uiState.previousStreak}-day streak has been reset. Burn today to start a new one!",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.error.copy(alpha = 0.8f),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }

        // Streak Shield indicator
        if (uiState.streakShieldActive) {
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier
                    .background(
                        color = colors.success.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(8.dp),
                    )
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "\uD83D\uDEE1\uFE0F",
                    fontSize = 14.sp,
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Streak Shield Active",
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.success,
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.sp,
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Quick stats row under ring
        if (!walletAddress.isNullOrBlank() && uiState.lifetimeBurned > 0) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                MiniStat(
                    value = "${uiState.lifetimeBurned.let { if (it == it.toLong().toDouble()) it.toLong().toString() else String.format(java.util.Locale.US, "%.1f", it) }}",
                    label = "SKR burned",
                )
                MiniStat(value = "${uiState.longestStreak}", label = "Best streak")
                MiniStat(value = "${uiState.badgesEarned}", label = "Badges")
            }
            Spacer(modifier = Modifier.height(20.dp))
        } else {
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ── Auth error ──
        if (authState is AuthState.Error) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.error.copy(alpha = 0.1f), PixelShape)
                    .pixelBorder(color = colors.error.copy(alpha = 0.4f), glowColor = Color.Transparent, borderWidth = 1.dp)
                    .padding(12.dp),
            ) {
                Text(
                    text = authState.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.error,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        // ── Wallet required card ──
        if (walletAddress.isNullOrBlank()) {
            BurnCard {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Welcome to Seeker Burn Club",
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Connect your wallet to start burning SKR and building your streak.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.textSecondary,
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ── Burn Card ──
        BurnCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Today's Burn",
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.weight(1f))
                if (uiState.hasBurnedToday) {
                    Box(
                        modifier = Modifier
                            .background(colors.success.copy(alpha = 0.12f), PixelShape)
                            .pixelBorder(color = colors.success.copy(alpha = 0.3f), glowColor = Color.Transparent, borderWidth = 1.dp)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            BurnIcon(
                                icon = BurnIcons.CheckCircle,
                                contentDescription = null,
                                size = 12.dp,
                            )
                            Text(
                                text = "DONE",
                                style = MaterialTheme.typography.labelMedium,
                                color = colors.success,
                                fontSize = 10.sp,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Editable burn amount input
            var amountText by remember { mutableStateOf(uiState.burnAmount.let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString() }) }

            Text("Amount", style = MaterialTheme.typography.labelMedium, color = colors.textSecondary)
            Spacer(modifier = Modifier.height(6.dp))

            OutlinedTextField(
                value = amountText,
                onValueChange = { raw ->
                    val filtered = raw.filter { c -> c.isDigit() || c == '.' }
                    // Limit to 6 decimal places (SPL token precision) and single decimal point
                    val dotIndex = filtered.indexOf('.')
                    val valid = if (dotIndex >= 0 && filtered.length - dotIndex - 1 > 6) {
                        filtered.substring(0, dotIndex + 7) // max 6 decimals
                    } else {
                        filtered
                    }
                    if (valid.count { it == '.' } <= 1) {
                        amountText = valid
                        val parsed = valid.toDoubleOrNull() ?: 0.0
                        viewModel.setBurnAmount(parsed)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                suffix = { Text("SKR", style = MaterialTheme.typography.labelLarge, color = colors.textTertiary) },
                shape = PixelShape,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = colors.primary,
                    unfocusedBorderColor = colors.border,
                    cursorColor = colors.primary,
                    focusedTextColor = colors.textPrimary,
                    unfocusedTextColor = colors.textPrimary,
                    focusedContainerColor = colors.surfaceElevated2,
                    unfocusedContainerColor = colors.surfaceElevated2,
                ),
                textStyle = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Quick-pick amount chips
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SeekerBurnConfig.BURN_AMOUNT_PRESETS.forEach { preset ->
                    FilterChip(
                        selected = uiState.burnAmount == preset.toDouble(),
                        onClick = {
                            amountText = preset.toString()
                            viewModel.setBurnAmount(preset.toDouble())
                        },
                        label = {
                            Text(
                                "$preset",
                                fontWeight = if (uiState.burnAmount == preset.toDouble()) FontWeight.Bold else FontWeight.Normal,
                            )
                        },
                        modifier = Modifier.weight(1f),
                        shape = PixelShape,
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = colors.primary.copy(alpha = 0.18f),
                            selectedLabelColor = colors.primary,
                            containerColor = colors.surfaceElevated2,
                            labelColor = colors.textSecondary,
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = uiState.burnAmount == preset.toDouble(),
                            borderColor = colors.border,
                            selectedBorderColor = colors.primary.copy(alpha = 0.5f),
                        ),
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Summary
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surfaceElevated2, PixelShape)
                    .pixelBorder(color = colors.border.copy(alpha = 0.5f), glowColor = Color.Transparent, borderWidth = 1.dp)
                    .padding(12.dp),
            ) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Burn", style = MaterialTheme.typography.bodyMedium, color = colors.textSecondary)
                        Text(
                            text = "${uiState.burnAmount} SKR",
                            style = MaterialTheme.typography.bodyMedium,
                            color = colors.textPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Platform fee (${SeekerBurnConfig.PLATFORM_FEE_PERCENT.toInt()}%)", style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
                        Text("${uiState.feeAmount.toBigDecimal().stripTrailingZeros().toPlainString()} SKR", style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    PixelDivider(color = colors.border.copy(alpha = 0.5f))
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Balance", style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
                        Text("${uiState.skrBalance} SKR", style = MaterialTheme.typography.bodySmall, color = colors.textTertiary)
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Burn CTA
            BurnButton(
                text = when {
                    uiState.isLoading -> "Loading…"
                    walletAddress.isNullOrBlank() -> "Connect Wallet First"
                    uiState.burnAmount < SeekerBurnConfig.MIN_BURN_SKR -> "Min ${SeekerBurnConfig.MIN_BURN_SKR} SKR"
                    uiState.insufficientBalance -> "Insufficient SKR"
                    uiState.insufficientSol -> "Need SOL for Fees"
                    else -> "Burn ${uiState.burnAmount} SKR"
                },
                onClick = { viewModel.preflightBurn() },
                enabled = uiState.canBurn && !walletAddress.isNullOrBlank(),
                isLoading = uiState.isLoading,
            )

            // SOL faucet hint — shown when wallet has no devnet SOL for gas
            if (uiState.insufficientSol) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "You need devnet SOL for transaction gas fees.\nGet free SOL at faucet.solana.com — select Devnet & paste your wallet address.",
                    style = MaterialTheme.typography.bodySmall,
                    color = SeekerBurnTheme.colors.warning,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (uiState.insufficientBalance) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Not enough SKR for this burn. Confirm your wallet holds SKR on Devnet for mint ${SeekerBurnConfig.SKR_MINT.take(6)}...${SeekerBurnConfig.SKR_MINT.takeLast(4)}.",
                    style = MaterialTheme.typography.bodySmall,
                    color = SeekerBurnTheme.colors.warning,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── Creature Showcase ──
        if (uiState.mintedBadgeIds.isNotEmpty() && uiState.walletAddress.isNotBlank()) {
            BurnCard {
                SectionHeader(title = "Your Burn Spirits")
                Text(
                    text = "Unique pixel creatures for each badge you mint",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                    modifier = Modifier.padding(bottom = 10.dp),
                )
                val ctx = LocalContext.current
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(uiState.mintedBadgeIds.toList()) { badgeId ->
                        val url = "${SeekerBurnConfig.BACKEND_URL}/api/v1/creatures/image/${uiState.walletAddress}/$badgeId.gif"
                        Box(
                            modifier = Modifier
                                .size(80.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(colors.surfaceElevated)
                                .clickable { onNavigateToBadgeDetail(badgeId) },
                            contentAlignment = Alignment.Center,
                        ) {
                            SubcomposeAsyncImage(
                                model = ImageRequest.Builder(ctx)
                                    .data(url)
                                    .decoderFactory(ImageDecoderDecoder.Factory())
                                    .memoryCacheKey(url)
                                    .crossfade(true)
                                    .build(),
                                contentDescription = "Creature for $badgeId",
                                modifier = Modifier.fillMaxSize(),
                                loading = {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        color = colors.primary,
                                        strokeWidth = 2.dp,
                                    )
                                },
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        } else if (!walletAddress.isNullOrBlank()) {
            // Teaser for users with no badges yet
            BurnCard {
                SectionHeader(title = "Burn Spirits")
                Text(
                    text = "Earn badges to unlock unique pixel creatures — each one is yours alone",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                    modifier = Modifier.padding(bottom = 10.dp),
                )
                val ctx = LocalContext.current
                val teaserEntries = listOf(
                    "SBCSpirit_Ember" to "BURN_1",
                    "SBCSpirit_Abyss" to "STREAK_7",
                    "SBCSpirit_Solaris" to "STREAK_30",
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    teaserEntries.forEach { (seed, bId) ->
                        val url = "${SeekerBurnConfig.BACKEND_URL}/api/v1/creatures/image/$seed/$bId.gif"
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(colors.surfaceElevated),
                            contentAlignment = Alignment.Center,
                        ) {
                            SubcomposeAsyncImage(
                                model = ImageRequest.Builder(ctx)
                                    .data(url)
                                    .decoderFactory(ImageDecoderDecoder.Factory())
                                    .memoryCacheKey(url)
                                    .crossfade(true)
                                    .build(),
                                contentDescription = "Example creature",
                                modifier = Modifier.fillMaxSize(),
                                loading = {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        color = colors.primary,
                                        strokeWidth = 2.dp,
                                    )
                                },
                            )
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ── Goals: compute once, pass down ──
        val nowLocal by produceState(initialValue = ZonedDateTime.now()) {
            while (true) {
                value = ZonedDateTime.now()
                delay(30_000L)
            }
        }
        val nowUtc by produceState(initialValue = ZonedDateTime.now(ZoneOffset.UTC)) {
            while (true) {
                value = ZonedDateTime.now(ZoneOffset.UTC)
                delay(30_000L)
            }
        }
        val dailyMissions  = remember(nowLocal.toLocalDate(), uiState.hasBurnedToday, uiState.lifetimeBurned, uiState.currentStreak) {
            val now = nowLocal
            GoalsEngine.dailyMissions(uiState, now)
        }
        val weeklyQuests = remember(
            nowUtc.get(IsoFields.WEEK_BASED_YEAR),
            nowUtc.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR),
            uiState.weeklyBurnDays,
            uiState.weeklyBurnSKR,
            uiState.lifetimeBurned,
        ) {
            val now = nowUtc
            GoalsEngine.weeklyQuests(uiState, now)
        }
        val milestones = remember(uiState.currentStreak, uiState.lifetimeBurned) {
            GoalsEngine.milestones(uiState)
        }

        // ── Daily Missions ──
        BurnCard {
            SectionHeader(title = "Daily Missions")
            Text(
                text = "Resets at midnight (local) · ${nowLocal.toLocalDate()}",
                style = MaterialTheme.typography.bodySmall,
                color = colors.textTertiary,
                fontSize = 9.sp,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            dailyMissions.forEach { m ->
                MissionRow(
                    title = m.title,
                    description = m.description,
                    currentLabel = m.currentLabel,
                    progress = m.progress,
                    isCompleted = m.isCompleted,
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // ── Weekly Quests ──
        BurnCard {
            val now = nowUtc
            val weekMonday  = now.toLocalDate().minusDays(now.dayOfWeek.value.toLong() - 1)
            SectionHeader(title = "Weekly Quests")
            Text(
                text = "Resets Monday UTC · $weekMonday",
                style = MaterialTheme.typography.bodySmall,
                color = colors.textTertiary,
                fontSize = 9.sp,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            weeklyQuests.forEach { q ->
                MissionRow(
                    title = q.title,
                    description = q.description,
                    currentLabel = q.currentLabel,
                    progress = q.progress,
                    isCompleted = q.isCompleted,
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // ── Milestones ──
        BurnCard {
            SectionHeader(title = "Milestones")
            milestones.forEach { m ->
                MilestoneRow(
                    title = m.title,
                    subtitle = m.subtitle,
                    currentLabel = m.currentLabel,
                    targetLabel = m.targetLabel,
                    progress = m.progress,
                    isCompleted = m.isCompleted,
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── Achievements ──
        BurnCard {
            SectionHeader(title = "Achievements")
            AchievementRow("First Burn", uiState.lifetimeBurned >= 1.0)
            AchievementRow("10 SKR Burned", uiState.lifetimeBurned >= 10.0)
            AchievementRow("7-Day Discipline", uiState.longestStreak >= 7)
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── Perks Teaser ──
        if (!walletAddress.isNullOrBlank()) {
            BurnCard {
                SectionHeader(title = "Perks & Rewards")
                Text(
                    text = "Earn badges to unlock exclusive perks: merch discounts, streak shields, NFT priority, and more.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textSecondary,
                )
                Spacer(modifier = Modifier.height(12.dp))
                SecondaryButton(
                    text = "View Perks",
                    onClick = onNavigateToPerks,
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ── Vault Deposit Card ──
        BurnCard {
            SectionHeader(title = "Community Vault")
            Text(
                text = "Contribute SKR to the community vault and fund collective rewards.",
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textSecondary,
            )
            Spacer(modifier = Modifier.height(12.dp))
            SecondaryButton(
                text = "View Vault",
                onClick = onNavigateToTreasury,
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── Global Program Stats ──
        BurnCard {
            SectionHeader(title = "Global Burn Stats")

            if (globalState.isLoading) {
                Box(modifier = Modifier.fillMaxWidth().height(80.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = colors.primary,
                        strokeWidth = 2.dp,
                    )
                }
            } else if (globalState.stats != null) {
                val stats = globalState.stats ?: return@BurnCard

                // Hero number
                Text(
                    text = "${numberFormat.format(stats.totalSkrBurnedDouble)} SKR",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        letterSpacing = (-0.5).sp,
                    ),
                    color = colors.primary,
                )
                Text(
                    text = "total burned by all members",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                )
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    MiniStat(value = numberFormat.format(stats.totalBurnTransactions), label = "Burns")
                    MiniStat(value = numberFormat.format(stats.uniqueBurners), label = "Burners")
                    MiniStat(value = "${stats.highestEverStreak}", label = "Top streak")
                }
            } else if (globalState.error != null) {
                Text(
                    text = "Could not load global stats",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textTertiary,
                )
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
    } // end PullToRefreshBox

    SnackbarHost(
        hostState = snackbarHostState,
        modifier = Modifier.align(Alignment.BottomCenter),
    )
    } // end Box
}

/**
 * Small stat pill used under the streak ring and in global stats.
 */
@Composable
private fun MiniStat(value: String, label: String) {
    val colors = SeekerBurnTheme.colors
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            color = colors.textPrimary,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
            color = colors.textTertiary,
        )
    }
}

/** Row for a daily mission or weekly quest — shows title, description, label, and pixel progress bar. */
@Composable
private fun MissionRow(
    title: String,
    description: String,
    currentLabel: String,
    progress: Float,
    isCompleted: Boolean,
) {
    val colors = SeekerBurnTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .background(
                if (isCompleted) colors.success.copy(alpha = 0.04f)
                else Color.Transparent
            )
            .pixelBorder(
                color = if (isCompleted) colors.success.copy(alpha = 0.25f)
                        else colors.border.copy(alpha = 0.15f),
                glowColor = Color.Transparent,
                borderWidth = 1.dp,
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = title,
                fontFamily = PressStart2P,
                fontSize = 9.sp,
                color = if (isCompleted) colors.success else colors.primary,
                modifier = Modifier.weight(1f),
            )
            // Status chip
            Box(
                modifier = Modifier
                    .background(
                        if (isCompleted) colors.success.copy(alpha = 0.15f)
                        else colors.surfaceElevated2,
                    )
                    .pixelBorder(
                        color = if (isCompleted) colors.success.copy(alpha = 0.5f)
                                else colors.border.copy(alpha = 0.4f),
                        glowColor = Color.Transparent,
                        borderWidth = 1.dp,
                    )
                    .padding(horizontal = 6.dp, vertical = 3.dp),
            ) {
                Text(
                    text = if (isCompleted) "✓ DONE" else currentLabel,
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 8.sp,
                    color = if (isCompleted) colors.success else colors.textTertiary,
                )
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = description,
            style = MaterialTheme.typography.bodySmall,
            fontSize = 10.sp,
            color = colors.textSecondary,
        )
        Spacer(modifier = Modifier.height(6.dp))
        PixelProgressBar(
            progress = progress,
            fillColor = if (isCompleted) colors.success else colors.primary,
            trackColor = colors.surfaceElevated2,
            borderColor = colors.border,
            blockCount = 16,
            height = 10.dp,
        )
    }
}

/** Row for long-term milestones — similar but with current/target end labels. */
@Composable
private fun MilestoneRow(
    title: String,
    subtitle: String,
    currentLabel: String,
    targetLabel: String,
    progress: Float,
    isCompleted: Boolean,
) {
    val colors = SeekerBurnTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .background(
                if (isCompleted) colors.primary.copy(alpha = 0.04f)
                else Color.Transparent
            )
            .pixelBorder(
                color = if (isCompleted) colors.primary.copy(alpha = 0.25f)
                        else colors.border.copy(alpha = 0.15f),
                glowColor = if (isCompleted) colors.primaryGlow.copy(alpha = 0.08f) else Color.Transparent,
                borderWidth = 1.dp,
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = title,
                fontFamily = PressStart2P,
                fontSize = 9.sp,
                color = if (isCompleted) colors.accent else colors.textPrimary,
                modifier = Modifier.weight(1f),
            )
            if (isCompleted) {
                Text(
                    text = "MAX",
                    fontFamily = PressStart2P,
                    fontSize = 8.sp,
                    color = colors.accent,
                )
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodySmall,
            fontSize = 10.sp,
            color = colors.textSecondary,
        )
        Spacer(modifier = Modifier.height(6.dp))
        PixelProgressBar(
            progress = progress,
            fillColor = if (isCompleted) colors.accent else colors.gradientFireStart,
            trackColor = colors.surfaceElevated2,
            borderColor = colors.border,
            blockCount = 20,
            height = 10.dp,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = currentLabel,
                style = MaterialTheme.typography.bodySmall,
                fontSize = 9.sp,
                color = colors.textTertiary,
            )
            Text(
                text = targetLabel,
                style = MaterialTheme.typography.bodySmall,
                fontSize = 9.sp,
                color = colors.textTertiary,
            )
        }
    }
}

@Composable
private fun AchievementRow(label: String, isUnlocked: Boolean) {
    val colors = SeekerBurnTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (isUnlocked) colors.textPrimary else colors.textSecondary,
        )
        Box(
            modifier = Modifier
                .background(
                    if (isUnlocked) colors.primary.copy(alpha = 0.15f) else colors.surfaceElevated2,
                    PixelShape,
                )
                .pixelBorder(
                    color = if (isUnlocked) colors.primary.copy(alpha = 0.4f) else colors.border.copy(alpha = 0.3f),
                    glowColor = Color.Transparent,
                    borderWidth = 1.dp,
                )
                .padding(horizontal = 8.dp, vertical = 3.dp),
        ) {
            Text(
                text = if (isUnlocked) "UNLOCKED" else "LOCKED",
                style = MaterialTheme.typography.labelMedium,
                color = if (isUnlocked) colors.primary else colors.textTertiary,
                fontSize = 9.sp,
            )
        }
    }
}
