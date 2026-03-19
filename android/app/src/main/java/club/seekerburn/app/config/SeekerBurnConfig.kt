package club.seekerburn.app.config

import club.seekerburn.app.BuildConfig
import com.solana.mobilewalletadapter.clientlib.Solana

/**
 * Hardcoded on-chain addresses and app configuration.
 * Treasury addresses MUST match on-chain state — verified at runtime.
 */
object SeekerBurnConfig {
    /** SKR token mint address */
    val SKR_MINT: String = BuildConfig.SKR_MINT

    /** Squads multisig treasury wallet public key */
    val TREASURY_WALLET: String = BuildConfig.TREASURY_WALLET

    /** Treasury's SKR Associated Token Account */
    val TREASURY_SKR_ATA: String = BuildConfig.TREASURY_SKR_ATA

    /** Backend API base URL */
    val BACKEND_URL: String = BuildConfig.BACKEND_URL

    /** Solana RPC endpoint */
    val RPC_URL: String = BuildConfig.RPC_URL

    /** Platform fee as a percentage of the burn amount (1.0 = 1%). Fee = burnAmount × PLATFORM_FEE_PERCENT / 100 */
    val PLATFORM_FEE_PERCENT: Double = BuildConfig.PLATFORM_FEE_PERCENT

    /** Minimum daily burn amount in SKR (UI units) */
    val MIN_BURN_SKR: Double = BuildConfig.MIN_BURN_SKR

    /** SPL Token Program ID */
    const val TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

    /** Associated Token Account Program ID */
    const val ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"

    /** App identity for wallet adapter (must be a real reachable HTTPS origin) */
    val APP_IDENTITY_URI: String = "https://seekerburnclub.xyz"
    const val APP_IDENTITY_NAME = "Seeker Burn Club"
    // MWA ConnectionIdentity requires iconRelativeUri to be a RELATIVE URI.
    // The wallet resolves the full icon URL as: APP_IDENTITY_URI + APP_ICON_URI.
    const val APP_ICON_URI = "/icon.png"

    /** True for devnet (debug + default builds), false for mainnet (release only). */
    val IS_DEVNET: Boolean = BuildConfig.IS_DEVNET

    /**
     * Solana network passed to MWA — must match the RPC cluster the transaction is built on.
     * Driven by IS_DEVNET so any build type (not just debug) can target devnet.
     */
    val SOLANA_BLOCKCHAIN = if (BuildConfig.IS_DEVNET) Solana.Devnet else Solana.Mainnet

    /** Transaction confirmation settings */
    const val TX_CONFIRM_POLL_INTERVAL_MS = 3000L
    const val TX_CONFIRM_MAX_POLLS = 40
    const val TX_CONFIRM_TIMEOUT_MS = 120_000L

    /** Streak milestone days — must match backend STREAK_MILESTONES */
    val STREAK_MILESTONES = listOf(1, 3, 7, 14, 21, 30, 60, 90, 180, 365, 500, 730, 1000, 1500)

    /** Lifetime burn milestones (in SKR) — must match backend LIFETIME_MILESTONES */
    val LIFETIME_MILESTONES = listOf(10.0, 50.0, 100.0, 500.0, 1000.0, 2500.0, 5000.0, 10000.0, 25000.0, 50000.0, 100000.0, 250000.0, 500000.0, 1000000.0)

    /** Daily volume milestones (in SKR) — must match backend DAILY_MILESTONES */
    val DAILY_MILESTONES = listOf(25.0, 100.0, 500.0, 2500.0, 10000.0)

    /** Total burn count milestones — must match backend TXCOUNT_MILESTONES */
    val TXCOUNT_MILESTONES = listOf(10, 50, 100, 500, 1000)

    /** Perfect month milestones — must match backend PERFECT_MILESTONES */
    val PERFECT_MILESTONES = listOf(1, 3, 6, 12)

    /** Solana Explorer base URL (add ?cluster=devnet for devnet) */
    const val EXPLORER_BASE_URL = "https://solscan.io"

    /** Solscan convenience URLs — cluster param matches IS_DEVNET */
    const val SOLSCAN_TX_URL = "$EXPLORER_BASE_URL/tx/"
    const val SOLSCAN_ACCOUNT_URL = "$EXPLORER_BASE_URL/account/"
    val SOLSCAN_CLUSTER_PARAM = if (BuildConfig.IS_DEVNET) "?cluster=devnet" else ""

    // ── Operational constants ──────────────────────────────────

    /** Minimum SOL balance (in lamports) required to cover transaction fees */
    const val MIN_SOL_FOR_TX_FEE_LAMPORTS = 100_000L

    /** UTC hour at which an un-burned day triggers "streak at risk" warning */
    const val STREAK_AT_RISK_UTC_HOUR = 22

    /** Delay (ms) before refreshing profile after a successful burn */
    const val POST_BURN_REFRESH_DELAY_MS = 500L

    /** Delay (ms) to hold the "Confirmed!" state before navigating away */
    const val CONFIRM_SUCCESS_PAUSE_MS = 500L

    /** Maximum retry attempts when submitting a burn to the backend */
    const val BACKEND_SUBMIT_MAX_RETRIES = 5

    /** Base delay (ms) for exponential backoff between submit retries */
    const val BACKEND_SUBMIT_BACKOFF_MS = 3_000L

    /** Quick-select burn amount presets shown in the UI */
    val BURN_AMOUNT_PRESETS = listOf(1, 5, 10, 50)

    /** Default page size for activity / history queries */
    const val ACTIVITY_PAGE_SIZE = 50

    /** Default page size for deposit history queries */
    const val DEPOSIT_PAGE_SIZE = 20

    /** Default page size for leaderboard queries */
    const val LEADERBOARD_PAGE_SIZE = 50

    /** Maximum allowed burn amount via deep link */
    val MAX_DEEPLINK_BURN = java.math.BigDecimal("1000000")
}
