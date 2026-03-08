package club.seekerburn.app.util

import club.seekerburn.app.config.SeekerBurnConfig

/**
 * Shared formatting utilities to eliminate duplication across screens.
 */
object FormatUtils {

    /** Truncate a wallet address: "AbCd…xYzW" */
    fun truncateAddress(address: String, prefixLen: Int = 4, suffixLen: Int = 4): String {
        return if (address.length > prefixLen + suffixLen + 1) {
            "${address.take(prefixLen)}…${address.takeLast(suffixLen)}"
        } else address
    }

    /** Truncate a transaction signature: "Ab12Cd34…wXyZ5678" */
    fun truncateSignature(sig: String, prefixLen: Int = 8, suffixLen: Int = 8): String {
        return truncateAddress(sig, prefixLen, suffixLen)
    }

    /** Build a Solscan transaction URL with the correct cluster param. */
    fun solscanTxUrl(signature: String): String {
        return "${SeekerBurnConfig.SOLSCAN_TX_URL}$signature${SeekerBurnConfig.SOLSCAN_CLUSTER_PARAM}"
    }

    /** Build a Solscan account URL with the correct cluster param. */
    fun solscanAccountUrl(address: String): String {
        return "${SeekerBurnConfig.SOLSCAN_ACCOUNT_URL}$address${SeekerBurnConfig.SOLSCAN_CLUSTER_PARAM}"
    }
}
