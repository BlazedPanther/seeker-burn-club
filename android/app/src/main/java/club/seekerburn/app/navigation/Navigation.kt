package club.seekerburn.app.navigation

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import club.seekerburn.app.ui.screens.*
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.viewmodel.HomeViewModel
import kotlinx.coroutines.flow.map

object Routes {
    const val ONBOARDING = "onboarding"
    const val MAIN = "main?tab={tab}"
        fun main(tab: Int = 0): String = "main?tab=$tab"

    const val BURN_CONFIRM = "burn_confirm"
    const val TX_PENDING = "tx_pending/{signature}?burnAmount={burnAmount}&feeAmount={feeAmount}"
    const val TX_SUCCESS = "tx_success/{signature}/{burnAmount}/{newStreak}?badgeEarned={badgeEarned}&badgeEarnedId={badgeEarnedId}"
    const val TX_FAILURE = "tx_failure/{errorType}?errorDetail={errorDetail}"
    const val BADGE_DETAIL = "badge_detail/{badgeId}"
    const val PERK_DETAIL = "perk_detail/{perkId}"
    const val PERKS_LIST = "perks_list"
    const val ACTIVITY = "activity"
    const val TREASURY = "treasury"
    const val SETTINGS = "settings"
    const val REFERRALS = "referrals"
    const val ABOUT = "about"

    fun txPending(sig: String, burnAmount: String? = null, feeAmount: String? = null): String {
        val base = "tx_pending/$sig"
        val params = mutableListOf<String>()
        if (burnAmount != null) params.add("burnAmount=$burnAmount")
        if (feeAmount != null) params.add("feeAmount=$feeAmount")
        return if (params.isNotEmpty()) "$base?${params.joinToString("&")}" else base
    }

    fun txSuccess(
        sig: String,
        burnAmount: String = "1.00",
        newStreak: Int = 1,
        badgeEarned: String? = null,
        badgeEarnedId: String? = null,
    ): String {
        val base = "tx_success/$sig/$burnAmount/$newStreak"
        val params = mutableListOf<String>()
        if (badgeEarned != null) params.add("badgeEarned=$badgeEarned")
        if (badgeEarnedId != null) params.add("badgeEarnedId=$badgeEarnedId")
        return if (params.isNotEmpty()) "$base?${params.joinToString("&")}" else base
    }

    fun txFailure(
        errorType: BurnErrorType,
        errorDetail: String? = null,
    ): String {
        val base = "tx_failure/${errorType.name}"
        return if (errorDetail != null) "$base?errorDetail=${Uri.encode(errorDetail)}" else base
    }

    fun badgeDetail(id: String) = "badge_detail/$id"
    fun perkDetail(id: String) = "perk_detail/$id"
}

@Composable
fun SeekerBurnNavHost(
    walletSender: ActivityResultSender,
    navController: NavHostController = rememberNavController()
) {
    val context = LocalContext.current
    val openUrl: (String) -> Unit = { url ->
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    // Determine start destination based on onboarding state
    // Use null initial to avoid rendering NavHost before DataStore emits
    val authViewModel: club.seekerburn.app.viewmodel.AuthViewModel = hiltViewModel()
    val onboardingState by remember {
        authViewModel.isOnboardingComplete.map<Boolean, Boolean?> { it }
    }.collectAsState(initial = null)

    // ── Cinematic intro (plays once per cold start) ──────────────────────
    var introFinished by remember { mutableStateOf(false) }

    if (!introFinished) {
        IntroScreen(onFinished = { introFinished = true })
        return
    }

    if (onboardingState == null) {
        // DataStore hasn't loaded yet — show blank themed screen (splash)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(SeekerBurnTheme.colors.surface)
        )
        return
    }

    val startDest = if (onboardingState == true) Routes.main() else Routes.ONBOARDING

    NavHost(
        navController = navController,
        startDestination = startDest,
    ) {
        composable(Routes.ONBOARDING) {
            OnboardingScreen(
                onComplete = {
                    navController.navigate(Routes.main()) {
                        popUpTo(Routes.ONBOARDING) { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = Routes.MAIN,
            arguments = listOf(
                navArgument("tab") {
                    type = NavType.IntType
                    defaultValue = 0
                },
            ),
        ) { backStack ->
            val initialTab = backStack.arguments?.getInt("tab") ?: 0
            MainScreen(
                walletSender = walletSender,
                onNavigateToBurnConfirm = { navController.navigate(Routes.BURN_CONFIRM) },
                onNavigateToActivity = { navController.navigate(Routes.ACTIVITY) },
                onNavigateToTreasury = { navController.navigate(Routes.TREASURY) },
                onNavigateToSettings = { navController.navigate(Routes.SETTINGS) },
                onNavigateToReferrals = { navController.navigate(Routes.REFERRALS) },
                onNavigateToAbout = { navController.navigate(Routes.ABOUT) },
                onNavigateToBadgeDetail = { navController.navigate(Routes.badgeDetail(it)) },
                onNavigateToPerkDetail = { navController.navigate(Routes.perkDetail(it)) },
                onNavigateToPerks = { navController.navigate(Routes.PERKS_LIST) },
                initialTab = initialTab,
            )
        }

        composable(Routes.BURN_CONFIRM) {
            val mainEntry = remember(navController) { navController.getBackStackEntry(Routes.MAIN) }
            BurnConfirmScreen(
                walletSender = walletSender,
                onDismiss = { navController.popBackStack() },
                onBurnSigned = { sig, burnAmt, feeAmt ->
                    navController.navigate(Routes.txPending(sig, burnAmt, feeAmt)) {
                        popUpTo(Routes.MAIN)
                    }
                },
                onBurnSubmitted = { sig, newStreak, burnAmount, badgeEarned, badgeEarnedId ->
                    navController.navigate(Routes.txSuccess(sig, burnAmount, newStreak, badgeEarned, badgeEarnedId)) {
                        popUpTo(Routes.MAIN)
                    }
                },
                viewModel = hiltViewModel(mainEntry),
            )
        }

        composable(
            route = Routes.TX_PENDING,
            arguments = listOf(
                navArgument("signature") { type = NavType.StringType },
                navArgument("burnAmount") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("feeAmount") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
        ) { backStack ->
            val sig = backStack.arguments?.getString("signature") ?: ""
            val pendingBurnAmount = backStack.arguments?.getString("burnAmount")
            val pendingFeeAmount = backStack.arguments?.getString("feeAmount")
            TransactionPendingScreen(
                signature = sig,
                burnAmount = pendingBurnAmount,
                feeAmount = pendingFeeAmount,
                onConfirmed = { burnAmount, newStreak, badgeEarned, badgeEarnedId ->
                    navController.navigate(Routes.txSuccess(sig, burnAmount, newStreak, badgeEarned, badgeEarnedId)) {
                        popUpTo(Routes.MAIN)
                    }
                },
                onTimeout = {
                    navController.navigate(Routes.txFailure(BurnErrorType.TIMEOUT, "sig:$sig")) {
                        popUpTo(Routes.MAIN)
                    }
                },
            )
        }

        composable(
            route = Routes.TX_SUCCESS,
            arguments = listOf(
                navArgument("signature") { type = NavType.StringType },
                navArgument("burnAmount") { type = NavType.StringType },
                navArgument("newStreak") { type = NavType.IntType },
                navArgument("badgeEarned") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("badgeEarnedId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
        ) { backStack ->
            val sig = backStack.arguments?.getString("signature") ?: ""
            val burnAmount = backStack.arguments?.getString("burnAmount") ?: "1.00"
            val newStreak = backStack.arguments?.getInt("newStreak") ?: 1
            val badgeEarned = backStack.arguments?.getString("badgeEarned")
            val badgeEarnedId = backStack.arguments?.getString("badgeEarnedId")
            TransactionSuccessScreen(
                signature = sig,
                burnAmount = burnAmount,
                newStreak = newStreak,
                badgeEarned = badgeEarned,
                badgeEarnedId = badgeEarnedId,
                onViewExplorer = openUrl,
                onClaimNft = { id ->
                    navController.navigate(Routes.main(tab = 1)) {
                        popUpTo(Routes.MAIN) { inclusive = true }
                    }
                    navController.navigate(Routes.badgeDetail(id)) {
                        launchSingleTop = true
                    }
                },
                onDone = {
                    navController.navigate(Routes.main()) {
                        popUpTo(Routes.MAIN) { inclusive = true }
                    }
                },
            )
        }

        composable(
            route = Routes.TX_FAILURE,
            arguments = listOf(
                navArgument("errorType") { type = NavType.StringType },
                navArgument("errorDetail") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
        ) { backStack ->
            val errorTypeName = backStack.arguments?.getString("errorType") ?: "UNKNOWN"
            val errorType = try {
                BurnErrorType.valueOf(errorTypeName)
            } catch (_: Exception) {
                BurnErrorType.UNKNOWN
            }
            val errorDetail = backStack.arguments?.getString("errorDetail")
            TransactionFailureScreen(
                errorType = errorType,
                errorDetail = errorDetail,
                onRetry = {
                    navController.navigate(Routes.BURN_CONFIRM) {
                        popUpTo(Routes.MAIN)
                    }
                },
                onGoBack = {
                    navController.navigate(Routes.main()) {
                        popUpTo(Routes.MAIN) { inclusive = true }
                    }
                },
            )
        }

        composable(
            route = Routes.BADGE_DETAIL,
            arguments = listOf(navArgument("badgeId") { type = NavType.StringType }),
        ) { backStack ->
            val badgeId = backStack.arguments?.getString("badgeId") ?: ""
            BadgeDetailScreen(
                badgeId = badgeId,
                walletSender = walletSender,
                onBack = { navController.popBackStack() },
                onViewNft = openUrl,
            )
        }

        composable(
            route = Routes.PERK_DETAIL,
            arguments = listOf(navArgument("perkId") { type = NavType.StringType }),
        ) { backStack ->
            val perkId = backStack.arguments?.getString("perkId") ?: ""
            PerkDetailScreen(
                perkId = perkId,
                onBack = { navController.popBackStack() },
                onClaim = { /* handled by PerkDetailViewModel internally */ },
            )
        }

        composable(Routes.ACTIVITY) {
            ActivityScreen(
                onBack = { navController.popBackStack() },
                onViewExplorer = openUrl,
            )
        }

        composable(Routes.PERKS_LIST) {
            PerksListScreen(
                onBack = { navController.popBackStack() },
                onPerkTap = { perkId -> navController.navigate(Routes.perkDetail(perkId)) },
            )
        }

        composable(Routes.TREASURY) {
            TreasuryScreen(
                onBack = { navController.popBackStack() },
                onViewExplorer = openUrl,
            )
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onNavigateToAbout = { navController.navigate(Routes.ABOUT) },
                onOpenUrl = openUrl,
            )
        }

        composable(Routes.REFERRALS) {
            ReferralScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.ABOUT) {
            AboutScreen(
                onBack = { navController.popBackStack() },
                onOpenUrl = openUrl,
            )
        }
    }
}
