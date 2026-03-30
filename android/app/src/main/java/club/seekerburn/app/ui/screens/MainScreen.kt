package club.seekerburn.app.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import club.seekerburn.app.R
import club.seekerburn.app.ui.components.scanlineOverlay
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.viewmodel.AuthState
import club.seekerburn.app.viewmodel.AuthViewModel
import club.seekerburn.app.viewmodel.BadgesViewModel
import club.seekerburn.app.viewmodel.HomeViewModel
import club.seekerburn.app.viewmodel.LeaderboardViewModel

/**
 * Main scaffold with pixel-art bottom navigation: Home, Badges, Board, More.
 */
@Composable
fun MainScreen(
    walletSender: ActivityResultSender,
    onNavigateToBurnConfirm: () -> Unit,
    onNavigateToActivity: () -> Unit,
    onNavigateToTreasury: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToReferrals: () -> Unit,
    onNavigateToAbout: () -> Unit,
    onNavigateToBadgeDetail: (String) -> Unit,
    onNavigateToPerkDetail: (String) -> Unit,
    onNavigateToPerks: () -> Unit,
    onNavigateToChallenges: () -> Unit,
    onNavigateToShop: () -> Unit,
    onNavigateToInventory: () -> Unit,
    initialTab: Int = 0,
) {
    val colors = SeekerBurnTheme.colors
    var selectedTab by rememberSaveable { mutableIntStateOf(initialTab.coerceIn(0, 4)) }
    val authViewModel: AuthViewModel = hiltViewModel()
    val homeViewModel: HomeViewModel = hiltViewModel()
    val badgesViewModel: BadgesViewModel = hiltViewModel()
    val leaderboardViewModel: LeaderboardViewModel = hiltViewModel()
    val authState by authViewModel.state.collectAsState()
    val walletAddress by authViewModel.walletAddress.collectAsState(initial = null)
    val homeState by homeViewModel.uiState.collectAsState()
    val badgesState by badgesViewModel.uiState.collectAsState()
    val leaderboardState by leaderboardViewModel.uiState.collectAsState()

    val apiEarnedIds = badgesState.badges.filter { it.isEarned }.map { it.definition.id }.toSet()
    val optimisticEarnedIds = apiEarnedIds + homeState.earnedBadgeIds

    // If burn flow already knows about newly earned badges, trigger an authoritative refresh.
    LaunchedEffect(homeState.earnedBadgeIds, apiEarnedIds) {
        if ((homeState.earnedBadgeIds - apiEarnedIds).isNotEmpty()) {
            badgesViewModel.refresh()
        }
    }

    Scaffold(
        containerColor = colors.surface,
        bottomBar = {
            NavigationBar(
                containerColor = colors.surfaceElevated,
                contentColor = colors.textPrimary,
                modifier = Modifier
                    .scanlineOverlay(alpha = 0.04f)
                    .drawBehind {
                        // Pixel-art top border — thicker, fire-gradient
                        val borderH = 2.dp.toPx()
                        drawRect(
                            brush = Brush.horizontalGradient(
                                colors = listOf(
                                    colors.border,
                                    colors.primary.copy(alpha = 0.5f),
                                    colors.accent.copy(alpha = 0.3f),
                                    colors.primary.copy(alpha = 0.5f),
                                    colors.border,
                                ),
                            ),
                            topLeft = Offset(0f, 0f),
                            size = Size(size.width, borderH),
                        )
                    },
                tonalElevation = 0.dp,
            ) {
                val navItemColors = NavigationBarItemDefaults.colors(
                    selectedIconColor = colors.primary,
                    selectedTextColor = colors.primary,
                    unselectedIconColor = colors.textTertiary,
                    unselectedTextColor = colors.textTertiary,
                    indicatorColor = colors.primary.copy(alpha = 0.12f),
                )
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Image(painter = painterResource(R.mipmap.ic_launcher_foreground), contentDescription = "Home", modifier = Modifier.size(32.dp)) },
                    label = { Text("Home") },
                    colors = navItemColors,
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Filled.EmojiEvents, contentDescription = "Badges") },
                    label = { Text("Badges") },
                    colors = navItemColors,
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Filled.Leaderboard, contentDescription = "Board") },
                    label = { Text("Board") },
                    colors = navItemColors,
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { BurnIcon(icon = BurnIcons.Swords, contentDescription = "Arena", size = 24.dp) },
                    label = { Text("Arena") },
                    colors = navItemColors,
                )
                NavigationBarItem(
                    selected = selectedTab == 4,
                    onClick = { selectedTab = 4 },
                    icon = { Icon(Icons.Filled.MoreHoriz, contentDescription = "More") },
                    label = { Text("More") },
                    colors = navItemColors,
                )
            }
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(colors.surface),
        ) {
            Crossfade(
                targetState = selectedTab,
                animationSpec = tween(250),
                label = "tab_crossfade",
            ) { tab ->
                when (tab) {
                0 -> HomeTab(
                    onBurnTap = onNavigateToBurnConfirm,
                    walletAddress = walletAddress,
                    authState = authState,
                    onConnectWallet = {
                        if (authState !is AuthState.Connecting && authState !is AuthState.Signing && authState !is AuthState.Verifying) {
                            authViewModel.connect(walletSender)
                        }
                    },
                    onDisconnectWallet = { authViewModel.disconnect() },
                    onNavigateToBadgeDetail = onNavigateToBadgeDetail,
                    onNavigateToTreasury = onNavigateToTreasury,
                    onNavigateToPerks = onNavigateToPerks,
                )
                1 -> BadgesTab(
                    earnedBadgeIds = optimisticEarnedIds,
                    onBadgeTap = onNavigateToBadgeDetail,
                    isLoading = badgesState.isLoading,
                    error = badgesState.error,
                    onRetry = { badgesViewModel.refresh() },
                )
                2 -> LeaderboardTab(
                    rankings = leaderboardState.rankings,
                    userRank = leaderboardState.userRank,
                    selectedTab = LeaderboardTab.entries.firstOrNull { it.apiKey == leaderboardState.selectedFilter }
                        ?: LeaderboardTab.STREAK,
                    onTabChange = { leaderboardViewModel.selectFilter(it.apiKey) },
                    isLoading = leaderboardState.isLoading,
                    error = leaderboardState.error,
                    currentWalletAddress = walletAddress,
                )
                3 -> BattleArenaTab()
                4 -> MoreTab(
                    walletAddress = walletAddress,
                    onPerks = onNavigateToPerks,
                    onActivity = onNavigateToActivity,
                    onTreasury = onNavigateToTreasury,
                    onReferrals = onNavigateToReferrals,
                    onSettings = onNavigateToSettings,
                    onAbout = onNavigateToAbout,
                    onChallenges = onNavigateToChallenges,
                    onShop = onNavigateToShop,
                    onInventory = onNavigateToInventory,
                    onDisconnect = { authViewModel.disconnect() },
                )
                }
            }
        }
    }
}
