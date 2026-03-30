package club.seekerburn.app.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.data.api.TokenExpiredException
import club.seekerburn.app.di.ApiException
import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.model.BadgeDefinition
import club.seekerburn.app.model.BadgeType
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BadgeArtFallback
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.FireParticleEffect
import club.seekerburn.app.ui.components.GlitchText
import club.seekerburn.app.ui.components.PixelDivider
import club.seekerburn.app.ui.components.StatRow
import club.seekerburn.app.ui.components.pixelBorder
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils
import club.seekerburn.app.viewmodel.BadgesViewModel
import club.seekerburn.app.viewmodel.HomeViewModel
import android.util.Base64
import coil.compose.SubcomposeAsyncImage
import coil.decode.ImageDecoderDecoder
import coil.request.ImageRequest
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Detail view for a single badge (earned or locked).
 * Shows badge image, description, requirements, and NFT link if earned.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BadgeDetailScreen(
    badgeId: String,
    walletSender: ActivityResultSender,
    onBack: () -> Unit,
    onViewNft: (String) -> Unit,
    badgesViewModel: BadgesViewModel = hiltViewModel(),
    homeViewModel: HomeViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val coroutineScope = rememberCoroutineScope()
    val badgesState by badgesViewModel.uiState.collectAsState()
    val homeState by homeViewModel.uiState.collectAsState()

    var isClaiming by remember { mutableStateOf(false) }
    var claimError by remember { mutableStateOf<String?>(null) }
    var claimStep by remember(badgeId) { mutableStateOf(ClaimStep.READY) }
    var pendingClaimTxSignature by remember(badgeId) { mutableStateOf<String?>(null) }
    var pendingClaimMintPublicKey by remember(badgeId) { mutableStateOf<String?>(null) }
    var completedMintAddress by remember(badgeId) { mutableStateOf<String?>(null) }
    val badge = remember(badgeId) {
        BadgeDefinition.ALL.find { it.id == badgeId }
    }

    val confirmPendingClaim: suspend (String, String) -> Unit = { txSignature, mintPublicKey ->
        claimStep = ClaimStep.CONFIRM
        var confirmSuccess = false
        var lastError: Exception? = null

        // Step 1: fire confirm request (returns immediately with status MINTING)
        for (attempt in 1..3) {
            try {
                badgesViewModel.confirmBadgeClaim(badgeId, txSignature, mintPublicKey)
                confirmSuccess = true
                break
            } catch (ce: Exception) {
                lastError = ce
                if (attempt < 3) kotlinx.coroutines.delay(3000L * attempt)
            }
        }
        if (!confirmSuccess) throw (lastError ?: Exception("Confirmation failed"))

        // Step 2: poll claim/status every 5s until COMPLETED or MINT_FAILED (max 10 min)
        val maxPolls = 120
        var pollCount = 0
        var mintDone = false
        while (pollCount < maxPolls && !mintDone) {
            kotlinx.coroutines.delay(5000L)
            pollCount++
            try {
                val statusRes = badgesViewModel.getClaimStatus(badgeId)
                when (statusRes.status) {
                    "COMPLETED" -> {
                        pendingClaimTxSignature = null
                        pendingClaimMintPublicKey = null
                        claimError = null
                        completedMintAddress = statusRes.nftMintAddress
                        claimStep = ClaimStep.COMPLETE
                        badgesViewModel.refresh()
                        mintDone = true
                    }
                    "MINT_FAILED" -> throw Exception("NFT minting failed. Your SOL is safe — please try again.")
                    else -> { /* MINTING — keep polling */ }
                }
            } catch (se: Exception) {
                if (se.message?.contains("MINT_FAILED") == true) throw se
                // Transient network error — keep polling
            }
        }
        if (!mintDone) throw Exception("Minting is taking longer than expected. Your claim is saved \u2014 check back later.")
    }

    if (badge == null) {
        // Fallback: badge not found
        Column(
            modifier = Modifier.fillMaxSize().background(colors.surface),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Badge not found", color = colors.textSecondary)
        }
        return
    }

    // Real data from ViewModel
    val badgeItem = badgesState.badges.find { it.definition.id == badgeId }
    val isEarned = badgeItem?.isEarned ?: false
    val earnedDate: String? = badgeItem?.earnedAt
    val nftMintAddress: String? = completedMintAddress ?: badgeItem?.nftMintAddress
    val nftMintStatus: String? = badgeItem?.nftMintStatus
    val nftTxSignature: String? = badgeItem?.nftTxSignature
    val currentProgress = when (badge.type) {
        BadgeType.STREAK -> homeState.currentStreak
        BadgeType.LIFETIME -> homeState.lifetimeBurned.toInt()
        BadgeType.DAILY -> homeState.dailyBurnSKR.toInt()
        BadgeType.TXCOUNT -> homeState.totalBurnCount
        BadgeType.PERFECT -> homeState.perfectMonths
    }
    val requiredCount = badge.requirementValue

    val hasPendingConfirm = pendingClaimTxSignature != null && pendingClaimMintPublicKey != null
    val badgeStatus = when {
        !isEarned -> BadgeUiStatus.LOCKED
        nftMintAddress != null -> BadgeUiStatus.MINTED
        nftMintStatus == "MINT_FAILED" && !isClaiming -> BadgeUiStatus.MINT_FAILED
        isClaiming || hasPendingConfirm || nftMintStatus == "PENDING_CLAIM" || nftMintStatus == "MINTING" -> BadgeUiStatus.PENDING_CONFIRM
        else -> BadgeUiStatus.EARNED
    }

    // Auto-resume polling when badge is stuck in MINTING state (e.g. app restart during mint)
    LaunchedEffect(nftMintStatus) {
        if (nftMintStatus != "MINTING" || isClaiming) return@LaunchedEffect
        isClaiming = true
        claimStep = ClaimStep.CONFIRM
        claimError = null
        try {
            var mintDone = false
            repeat(120) { pollIdx ->
                if (!isClaiming) return@repeat
                delay(5000L)
                try {
                    val s = badgesViewModel.getClaimStatus(badgeId)
                    when (s.status) {
                        "COMPLETED" -> {
                            completedMintAddress = s.nftMintAddress
                            claimStep = ClaimStep.COMPLETE
                            claimError = null
                            badgesViewModel.refresh()
                            mintDone = true
                            return@LaunchedEffect
                        }
                        "MINT_FAILED" -> throw Exception(
                            "NFT minting failed. Your SOL is safe \u2014 tap Retry Mint."
                        )
                    }
                } catch (se: Exception) {
                    if (se.message?.contains("MINT_FAILED") == true) throw se
                }
            }
            if (!mintDone) {
                claimError = "Minting is taking longer than expected. Your claim is saved \u2014 check back later."
            }
        } catch (e: Exception) {
            claimError = mapClaimError(e)
        } finally {
            isClaiming = false
            badgesViewModel.refresh()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(badge.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.surface,
                    titleContentColor = colors.textPrimary,
                    navigationIconContentColor = colors.textPrimary,
                ),
            )
        },
        containerColor = colors.surface,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(24.dp))

            // Badge NFT card image (large)
            val context = LocalContext.current
            val walletForCreature = homeState.walletAddress.takeIf { it.isNotBlank() }
            val mintedCreatureUrl = walletForCreature?.let {
                "${SeekerBurnConfig.BACKEND_URL}/api/v1/creatures/image/$it/${badge.id}.gif"
            }
            val showMintedCreature = isEarned && nftMintAddress != null && mintedCreatureUrl != null
            Box(
                modifier = Modifier
                    .size(220.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(colors.surfaceElevated),
                contentAlignment = Alignment.Center,
            ) {
                SubcomposeAsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(
                            if (showMintedCreature) mintedCreatureUrl
                            else "${SeekerBurnConfig.BACKEND_URL}/api/v1/badges/image/${badge.id}.svg"
                        )
                        .apply {
                            if (showMintedCreature) {
                                decoderFactory(ImageDecoderDecoder.Factory())
                                memoryCacheKey(mintedCreatureUrl)
                            }
                        }
                        .crossfade(true)
                        .build(),
                    contentDescription = badge.name,
                    modifier = Modifier.fillMaxSize(),
                    loading = {
                        BadgeArtFallback(
                            badgeId = badge.id,
                            badgeName = badge.name,
                            modifier = Modifier.fillMaxSize(),
                        )
                    },
                    error = {
                        BadgeArtFallback(
                            badgeId = badge.id,
                            badgeName = badge.name,
                            modifier = Modifier.fillMaxSize(),
                        )
                    },
                )
                if (!isEarned) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(colors.surface.copy(alpha = 0.65f))
                    )
                    BurnIcon(
                        icon = BurnIcons.Lock,
                        contentDescription = "Locked",
                        size = 32.dp,
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Badge name
            Text(
                text = badge.name,
                style = MaterialTheme.typography.headlineMedium,
                color = if (isEarned) colors.textPrimary else colors.textTertiary,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Description
            Text(
                text = badge.description,
                style = MaterialTheme.typography.bodyLarge,
                color = colors.textSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 16.dp),
            )

            Spacer(modifier = Modifier.height(14.dp))

            BadgeStatusBanner(status = badgeStatus)

            Spacer(modifier = Modifier.height(24.dp))

            // Status card
            BurnCard {
                if (isEarned) {
                    StatRow(label = "Status", value = "Earned")
                    earnedDate?.let { StatRow(label = "Earned on", value = it) }
                    StatRow(label = "Category", value = badge.type.name)
                } else {
                    StatRow(label = "Status", value = "Locked")
                    StatRow(label = "Requirement", value = "${badge.requirementValue} ${badge.type.name.lowercase()}")
                    StatRow(label = "Progress", value = "$currentProgress / $requiredCount")

                    Spacer(modifier = Modifier.height(12.dp))

                    // Progress bar
                    val progress = if (requiredCount > 0) {
                        currentProgress.toFloat() / requiredCount.toFloat()
                    } else 0f

                    LinearProgressIndicator(
                        progress = { progress.coerceIn(0f, 1f) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp),
                        color = colors.primary,
                        trackColor = colors.surfaceElevated,
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    Text(
                        text = "${(progress * 100).toInt()}% complete",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textTertiary,
                    )
                }
            }

            // Burn Spirit NFT teaser — visible for ALL badges (motivator + preview)
            Spacer(modifier = Modifier.height(20.dp))

            GlitchText(
                text = if (isEarned) "YOUR BURN SPIRIT" else "BURN SPIRIT",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontFamily = PressStart2P,
                    fontSize = 13.sp,
                ),
                color = colors.primary,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = if (isEarned)
                           if (nftMintAddress != null)
                               "Your minted Burn Spirit for this badge"
                           else
                               "Your unique pixel creature — claim it as NFT on Solana"
                       else
                           "Earn this badge to unlock your own unique pixel creature",
                style = MaterialTheme.typography.bodySmall,
                color = colors.textTertiary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(14.dp))

            NftTeaserCarousel(
                walletAddress = homeState.walletAddress,
                currentBadgeId = badge.id,
                earned = isEarned,
                nftMinted = nftMintAddress != null,
            )

            // Locked-badge preview: show 3 more creatures side-by-side so the
            // user sees variety before committing to earn the badge.
            if (!isEarned) {
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "EXAMPLES · EVERY CREATURE IS UNIQUE",
                    fontFamily = PressStart2P,
                    fontSize = 6.sp,
                    color = colors.textTertiary,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    // Three fixed showcase entries that differ from what the carousel
                    // is cycling, so the row feels distinct.
                    val previewEntries = listOf(
                        "SBCSpirit_Abyss"    to "STREAK_7",
                        "SBCSpirit_Nexus"    to "BURN_1000",
                        "SBCSpirit_Solaris"  to "STREAK_30",
                    )
                    val ctx = LocalContext.current
                    previewEntries.forEach { (seed, bId) ->
                        val url = "${SeekerBurnConfig.BACKEND_URL}/api/v1/creatures/image/$seed/$bId.gif"
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                                .background(colors.surfaceElevated)
                                .pixelBorder(
                                    color     = colors.border,
                                    glowColor = Color.Transparent,
                                    borderWidth = 1.dp,
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            SubcomposeAsyncImage(
                                model = ImageRequest.Builder(ctx)
                                    .data(url)
                                    .decoderFactory(ImageDecoderDecoder.Factory())
                                    .memoryCacheKey(url)
                                    .build(),
                                contentDescription = "Example creature",
                                modifier = Modifier.fillMaxSize(),
                                loading = { PixelLoadingPulse(modifier = Modifier.fillMaxSize()) },
                                error   = { PixelCreaturePlaceholder(modifier = Modifier.fillMaxSize()) },
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            // NFT section (only for earned badges)
            if (isEarned) {
                Spacer(modifier = Modifier.height(16.dp))

                BurnCard {
                    Text(
                        text = "NFT Badge",
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    ClaimProgressStrip(
                        step = when {
                            nftMintAddress != null -> ClaimStep.COMPLETE
                            isClaiming && claimStep == ClaimStep.READY -> ClaimStep.PREPARE
                            else -> claimStep
                        },
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    if (nftMintAddress != null) {
                        // Already minted — show link
                        val displayMint = FormatUtils.truncateAddress(nftMintAddress, 8, 8)

                        StatRow(label = "Mint", value = displayMint)
                        StatRow(label = "Collection", value = "Seeker Burn Club")
                        StatRow(label = "Status", value = "Minted ✅")

                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedButton(
                            onClick = {
                                onViewNft(FormatUtils.solscanAccountUrl(nftMintAddress))
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("View on Solscan")
                        }
                    } else {
                        // Not yet minted — user claims and pays the fee themselves
                        Text(
                            text = "Claim this badge as a real NFT on Solana. You sign the transaction and pay network gas plus a small creator fee (shown before confirmation).",
                            style = MaterialTheme.typography.bodySmall,
                            color = colors.textSecondary,
                        )

                        if (claimError != null) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = claimError.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.error,
                            )
                        }

                        if (nftMintStatus == "PENDING_CLAIM") {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Claim is pending confirmation. If wallet signing already succeeded, retry confirm below.",
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.textTertiary,
                            )
                        }

                        // MINT_FAILED — transaction expired, user wasn't charged
                        if (nftMintStatus == "MINT_FAILED" && !isClaiming) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = "Previous attempt expired — you were not charged. Tap the button below to try again.",
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.textTertiary,
                            )
                        }

                        if (hasPendingConfirm) {
                            val retryTxSignature = pendingClaimTxSignature
                            val retryMintPublicKey = pendingClaimMintPublicKey
                            Spacer(modifier = Modifier.height(10.dp))
                            OutlinedButton(
                                onClick = {
                                    if (isClaiming) return@OutlinedButton
                                    if (retryTxSignature == null || retryMintPublicKey == null) return@OutlinedButton
                                    isClaiming = true
                                    claimStep = ClaimStep.CONFIRM
                                    claimError = null
                                    coroutineScope.launch {
                                        try {
                                            confirmPendingClaim(
                                                retryTxSignature,
                                                retryMintPublicKey,
                                            )
                                        } catch (e: Exception) {
                                            claimError = mapClaimError(e)
                                        } finally {
                                            isClaiming = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                enabled = !isClaiming,
                            ) {
                                Text("Retry Confirm (No New Tx)")
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Button(
                            onClick = {
                                if (isClaiming) return@Button
                                claimError = null
                                isClaiming = true
                                coroutineScope.launch {
                                    try {
                                        claimStep = ClaimStep.PREPARE
                                        val prepare = badgesViewModel.prepareBadgeClaim(badgeId)
                                        claimStep = ClaimStep.SIGN
                                        val txBytes = Base64.decode(prepare.serializedTx, Base64.DEFAULT)
                                        val signature = badgesViewModel.signAndSendTransaction(walletSender, txBytes)
                                        pendingClaimTxSignature = signature
                                        pendingClaimMintPublicKey = prepare.mintPublicKey
                                        claimStep = ClaimStep.CONFIRM
                                        confirmPendingClaim(signature, prepare.mintPublicKey)
                                        claimStep = ClaimStep.COMPLETE
                                    } catch (e: Exception) {
                                        claimError = mapClaimError(e)
                                        claimStep = if (pendingClaimTxSignature != null && pendingClaimMintPublicKey != null) {
                                            ClaimStep.CONFIRM
                                        } else {
                                            ClaimStep.READY
                                        }
                                    } finally {
                                        isClaiming = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = colors.primary,
                                contentColor = colors.textOnPrimary,
                            ),
                            enabled = !isClaiming,
                        ) {
                            if (isClaiming) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    color = colors.textOnPrimary,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Minting / Confirming\u2026")
                            } else {
                                Text("\uD83D\uDD25 Claim NFT \u2014 You Pay Gas")
                            }
                        }

                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

private enum class BadgeUiStatus {
    LOCKED,
    EARNED,
    PENDING_CONFIRM,
    MINT_FAILED,
    MINTED,
}

private enum class ClaimStep {
    READY,
    PREPARE,
    SIGN,
    CONFIRM,
    COMPLETE,
}

@Composable
private fun BadgeStatusBanner(status: BadgeUiStatus) {
    val colors = SeekerBurnTheme.colors
    val (icon, title, subtitle, accentColor) = when (status) {
        BadgeUiStatus.LOCKED -> Quadruple(
            BurnIcons.Lock,
            "Locked",
            "Complete the badge requirement to unlock NFT claim.",
            colors.textTertiary,
        )
        BadgeUiStatus.EARNED -> Quadruple(
            BurnIcons.Trophy,
            "Earned",
            "Badge unlocked. You can mint your Burn Spirit NFT now.",
            colors.primary,
        )
        BadgeUiStatus.PENDING_CONFIRM -> Quadruple(
            BurnIcons.Timer,
            "Pending Confirmation",
            "Transaction is in progress. Keep this screen open until confirmed.",
            colors.warning,
        )
        BadgeUiStatus.MINT_FAILED -> Quadruple(
            BurnIcons.Timer,
            "Mint Failed",
            "The NFT mint encountered an error. Tap Retry Mint — no additional payment needed.",
            colors.error,
        )
        BadgeUiStatus.MINTED -> Quadruple(
            BurnIcons.Verified,
            "Minted",
            "NFT is on-chain and linked to this badge.",
            colors.success,
        )
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = accentColor.copy(alpha = 0.10f),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BurnIcon(icon = icon, contentDescription = title, size = 20.dp)
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelLarge,
                    color = accentColor,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textSecondary,
                )
            }
        }
    }
}

@Composable
private fun ClaimProgressStrip(step: ClaimStep) {
    val colors = SeekerBurnTheme.colors
    val steps = listOf(
        "Prepare" to ClaimStep.PREPARE,
        "Sign" to ClaimStep.SIGN,
        "Confirm" to ClaimStep.CONFIRM,
    )

    val activeIndex = when (step) {
        ClaimStep.READY -> 0
        ClaimStep.PREPARE -> 0
        ClaimStep.SIGN -> 1
        ClaimStep.CONFIRM -> 2
        ClaimStep.COMPLETE -> 2
    }
    val completedIndex = when (step) {
        ClaimStep.READY -> -1
        ClaimStep.PREPARE -> -1
        ClaimStep.SIGN -> 0
        ClaimStep.CONFIRM -> 1
        ClaimStep.COMPLETE -> 2
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            steps.forEachIndexed { index, (label, _) ->
                val completed = index <= completedIndex
                val active = index == activeIndex && step != ClaimStep.COMPLETE
                val chipColor = when {
                    completed -> colors.success
                    active -> colors.primary
                    else -> colors.surfaceElevated2
                }
                val textColor = when {
                    completed -> Color.Black
                    active -> colors.textOnPrimary
                    else -> colors.textSecondary
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .background(chipColor, RoundedCornerShape(8.dp))
                        .padding(vertical = 7.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = textColor,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = when (step) {
                ClaimStep.READY -> "Ready to mint"
                ClaimStep.PREPARE -> "Preparing transaction"
                ClaimStep.SIGN -> "Waiting for wallet signature"
                ClaimStep.CONFIRM -> "Confirming on-chain"
                ClaimStep.COMPLETE -> "Completed"
            },
            style = MaterialTheme.typography.bodySmall,
            color = colors.textTertiary,
        )
    }
}

private data class Quadruple<A, B, C, D>(
    val first: A,
    val second: B,
    val third: C,
    val fourth: D,
)

private fun mapClaimError(error: Throwable): String {
    if (error is TokenExpiredException) {
        return "Session expired. Please reconnect your wallet and try again."
    }

    if (error is ApiException) {
        val code = Regex("\\\"error\\\"\\s*:\\s*\\\"([A-Z_]+)\\\"")
            .find(error.body)
            ?.groupValues
            ?.getOrNull(1)

        return when (code) {
            "MINTING_PAUSED" -> "NFT minting is currently paused. Please try again later."
            "BADGE_NOT_EARNED" -> "This badge is not earned yet for this wallet."
            "NFT_ALREADY_MINTED" -> "This badge NFT is already minted. Pull to refresh and open Solscan."
            "NO_PENDING_CLAIM" -> "No pending claim found. Tap Claim NFT again to create a new transaction."
            "CLAIM_EXPIRED" -> "Claim expired. Tap Claim NFT again to generate a fresh transaction."
            "MINT_MISMATCH" -> "Claim data mismatch. Please claim again from the badge screen."
            "TRANSACTION_NOT_CONFIRMED" -> "Transaction not confirmed yet. Wait a moment and tap Retry Confirm."
            "MINTING_IN_PROGRESS" -> "NFT is currently being minted. Please wait for it to complete."
            "TOKEN_VERIFICATION_FAILED" -> "Mint found but ownership check is still syncing. Tap Retry Confirm in a few seconds."
            "RATE_LIMIT_EXCEEDED" -> "Too many claim attempts. Please wait and try again."
            else -> "Claim failed (HTTP ${error.statusCode}). Please try again."
        }
    }

    val msg = error.message.orEmpty()
    if (msg.contains("No wallet found", ignoreCase = true)) {
        return "No compatible Solana wallet found. Open your wallet app and try again."
    }
    if (msg.contains("Transaction failed", ignoreCase = true)) {
        return "Wallet transaction failed. Please retry and approve in wallet."
    }

    return if (msg.isNotBlank()) msg else "Claim failed. Please try again."
}

// ────────────────────────────────────────────────────────────────────────────
//  NFT TEASER CAROUSEL
//  Cycles creature GIFs. Works even without a real wallet by using fixed
//  showcase seed-strings that always produce deterministic, interesting creatures.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Showcase (walletSeed, badgeId) pairs. These are NOT real Solana wallets —
 * they are deterministic hash seeds for the backend creature generator.
 */
private val SHOWCASE_ENTRIES = listOf(
    "SBCSpirit_Phantom"  to "STREAK_7",
    "SBCSpirit_Inferno"  to "STREAK_30",
    "SBCSpirit_Nexus"    to "STREAK_90",
    "SBCSpirit_Rift"     to "BURN_1000",
    "SBCSpirit_Abyss"    to "BURN_10000",
    "SBCSpirit_Solaris"  to "STREAK_365",
)

private fun badgeLabel(id: String): String = when (id) {
    "STREAK_1"        -> "FIRST FLAME"
    "STREAK_7"        -> "TORCH BEARER"
    "STREAK_30"       -> "INFERNO"
    "STREAK_90"       -> "ETERNAL FLAME"
    "STREAK_365"      -> "PHOENIX"
    "BURN_1000"      -> "SINGULARITY"
    "BURN_10000"     -> "ANNIHILATOR"
    else              -> id.replace("_", " ")
}

@Composable
private fun NftTeaserCarousel(
    walletAddress: String?,          // real wallet shown as slide 0 if non-empty
    currentBadgeId: String,
    earned: Boolean,
    nftMinted: Boolean = false,      // true if NFT already minted
    modifier: Modifier = Modifier,
) {
    val colors  = SeekerBurnTheme.colors
    val context = LocalContext.current

    // Show the real user-specific creature ONLY after an NFT has actually been minted.
    // Before mint, keep carousel purely as generic showcase to avoid spoilers.
    val hasRealWallet = !walletAddress.isNullOrBlank() && earned && nftMinted
    val slides: List<Pair<String, String>> = remember(walletAddress, currentBadgeId) {
        if (earned && nftMinted && hasRealWallet) {
            // Once minted, keep focus on the user's own creature for this badge.
            return@remember listOf(walletAddress!! to currentBadgeId)
        }
        val showcase = (SHOWCASE_ENTRIES.filter { it.second != currentBadgeId } + SHOWCASE_ENTRIES)
            .distinctBy { it }.take(5)
        showcase
    }

    var currentIndex by remember { mutableIntStateOf(0) }
    val alpha = remember { Animatable(1f) }

    LaunchedEffect(slides.size) {
        if (slides.size <= 1) return@LaunchedEffect
        while (true) {
            delay(2_800L)
            alpha.animateTo(0f, tween(250))
            currentIndex = (currentIndex + 1) % slides.size
            alpha.animateTo(1f, tween(300))
        }
    }

    val (slideWallet, slideBadge) = slides[currentIndex]
    val imageUrl = "${SeekerBurnConfig.BACKEND_URL}/api/v1/creatures/image/$slideWallet/$slideBadge.gif"

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier.fillMaxWidth(),
    ) {
        // ── Card ─────────────────────────────────────────────────────────
        Box(
            modifier = Modifier
                .size(200.dp)
                .pixelBorder(
                    color     = if (earned && currentIndex == 0) colors.primary else colors.border,
                    glowColor = if (earned && currentIndex == 0)
                                    colors.primaryGlow.copy(alpha = 0.4f)
                                else
                                    colors.primaryGlow.copy(alpha = 0.1f),
                    borderWidth = 2.dp,
                )
                .background(colors.surfaceElevated),
            contentAlignment = Alignment.Center,
        ) {
            FireParticleEffect(modifier = Modifier.fillMaxSize(), particleCount = 6, intensity = 0.4f)

            Box(
                modifier = Modifier.fillMaxSize().graphicsLayer { this.alpha = alpha.value },
                contentAlignment = Alignment.Center,
            ) {
                SubcomposeAsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(imageUrl)
                        .decoderFactory(ImageDecoderDecoder.Factory())
                        .memoryCacheKey(imageUrl)
                        .build(),
                    contentDescription = "Burn Spirit — ${badgeLabel(slideBadge)}",
                    modifier = Modifier.fillMaxSize(),
                    loading = { PixelLoadingPulse(modifier = Modifier.fillMaxSize()) },
                    error   = { PixelCreaturePlaceholder(modifier = Modifier.fillMaxSize()) },
                )
            }

            // YOURS chip on slide 0 (earned user creature) - only if NFT is minted
            if (currentIndex == 0 && earned && nftMinted && hasRealWallet) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd).padding(6.dp)
                        .background(colors.success.copy(alpha = 0.9f))
                        .pixelBorder(color = colors.success, glowColor = Color.Transparent, borderWidth = 1.dp)
                        .padding(horizontal = 6.dp, vertical = 3.dp),
                ) {
                    Text("YOURS", fontFamily = PressStart2P, fontSize = 7.sp, color = Color.Black)
                }
            }

            // PREVIEW chip on showcase slides (not shown for minted single-creature view)
            if (slides.size > 1 && !(currentIndex == 0 && hasRealWallet)) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart).padding(6.dp)
                        .background(colors.pixelCyan.copy(alpha = 0.85f))
                        .pixelBorder(color = colors.pixelCyan, glowColor = Color.Transparent, borderWidth = 1.dp)
                        .padding(horizontal = 6.dp, vertical = 3.dp),
                ) {
                    Text("PREVIEW", fontFamily = PressStart2P, fontSize = 6.sp, color = Color.Black)
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // ── Badge label ───────────────────────────────────────────────────
        Box(
            modifier = Modifier
                .graphicsLayer { this.alpha = alpha.value }
                .background(colors.surfaceElevated2)
                .pixelBorder(color = colors.primary.copy(alpha = 0.5f), glowColor = Color.Transparent, borderWidth = 1.dp)
                .padding(horizontal = 12.dp, vertical = 5.dp),
        ) {
            Text(badgeLabel(slideBadge), fontFamily = PressStart2P, fontSize = 8.sp, color = colors.accent)
        }

        Spacer(modifier = Modifier.height(10.dp))

        // ── Dot indicators ────────────────────────────────────────────────
        if (slides.size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                slides.forEachIndexed { idx, _ ->
                    Box(
                        modifier = Modifier
                            .size(if (idx == currentIndex) 8.dp else 5.dp)
                            .background(if (idx == currentIndex) colors.primary else colors.border),
                    )
                }
            }
        }
    }
}

/** Animated fire-scan shown while the creature GIF loads from backend. */
@Composable
private fun PixelLoadingPulse(modifier: Modifier = Modifier) {
    val colors = SeekerBurnTheme.colors
    val transition = rememberInfiniteTransition(label = "load_pulse")
    val scanY by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(900), repeatMode = RepeatMode.Restart),
        label = "scan_y",
    )
    val glowAlpha by transition.animateFloat(
        initialValue = 0.15f, targetValue = 0.45f,
        animationSpec = infiniteRepeatable(animation = tween(600), repeatMode = RepeatMode.Reverse),
        label = "glow_alpha",
    )
    Canvas(modifier = modifier) {
        drawRect(color = colors.surfaceElevated)
        drawRect(
            brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                colors = listOf(
                    Color.Transparent,
                    colors.gradientFireStart.copy(alpha = glowAlpha),
                    colors.gradientFireMid.copy(alpha = glowAlpha * 0.6f),
                    Color.Transparent,
                ),
                startY = scanY * size.height - size.height * 0.3f,
                endY   = scanY * size.height + size.height * 0.4f,
            ),
        )
        var y = 0f
        while (y < size.height) {
            drawLine(Color.Black.copy(alpha = 0.12f), Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
            y += 4f
        }
    }
}

/** Pixel-art smiley fallback if creature image fails to load. */
@Composable
private fun PixelCreaturePlaceholder(modifier: Modifier = Modifier) {
    val colors = SeekerBurnTheme.colors
    val transition = rememberInfiniteTransition(label = "ph_pulse")
    val pulse by transition.animateFloat(
        initialValue = 0.25f, targetValue = 0.6f,
        animationSpec = infiniteRepeatable(animation = tween(900), repeatMode = RepeatMode.Reverse),
        label = "ph_alpha",
    )
    Canvas(modifier = modifier) {
        val px  = size.width / 16f
        val col = colors.primary.copy(alpha = pulse)
        fun dot(gx: Float, gy: Float) =
            drawRect(col, Offset(gx * px + 1f, gy * px + 1f), Size(px - 2f, px - 2f))
        dot(5f, 5f); dot(10f, 5f)
        dot(4f, 9f); dot(5f, 10f); dot(6f, 11f); dot(9f, 11f); dot(10f, 10f); dot(11f, 9f)
        for (x in 3..12) { dot(x.toFloat(), 3f); dot(x.toFloat(), 12f) }
        for (y in 4..11) { dot(3f, y.toFloat()); dot(12f, y.toFloat()) }
    }
}