package club.seekerburn.app.data.solana

import club.seekerburn.app.config.SeekerBurnConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.sol4k.AccountMeta
import org.sol4k.Connection
import org.sol4k.PublicKey
import org.sol4k.Transaction
import org.sol4k.instruction.BaseInstruction
import org.sol4k.instruction.Instruction
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Handles Solana RPC calls and transaction building for burn + fee + deposit operations.
 * Uses sol4k 0.5.3 for Solana primitives.
 */
@Singleton
class SolanaService @Inject constructor() {

    private val connection by lazy { Connection(SeekerBurnConfig.RPC_URL) }
    private val skrMint by lazy { PublicKey(SeekerBurnConfig.SKR_MINT) }
    private val treasuryATA by lazy { PublicKey(SeekerBurnConfig.TREASURY_SKR_ATA) }

    companion object {
        private const val SPL_TOKEN_TRANSFER: Byte = 3
        private const val SPL_TOKEN_BURN: Byte = 8
        private val TOKEN_PROGRAM = PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        private val ATA_PROGRAM = PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    }

    // ── Queries ──

    /** Cached mint decimals — SPL mint decimals never change after deployment. */
    @Volatile
    private var _cachedDecimals: Int? = null

    suspend fun fetchMintDecimals(): Int {
        _cachedDecimals?.let { return it }
        return withContext(Dispatchers.IO) {
            val accountInfo = connection.getAccountInfo(skrMint)
            val data = accountInfo?.data ?: throw Exception("Failed to fetch mint account")
            if (data.size < 45) throw Exception("Mint account data too short: ${data.size} bytes")
            val decimals = data[44].toInt() and 0xFF
            _cachedDecimals = decimals
            decimals
        }
    }

    suspend fun fetchSkrBalance(walletAddress: String): Double = withContext(Dispatchers.IO) {
        val wallet = PublicKey(walletAddress)
        val ata = deriveATA(wallet, skrMint)
        try {
            val balance = connection.getTokenAccountBalance(ata)
            // sol4k 0.5.3: uiAmount is String, not Double
            balance.uiAmount.toDoubleOrNull() ?: 0.0
        } catch (e: Exception) {
            val message = e.message.orEmpty().lowercase()
            val ataMissing =
                message.contains("could not find account") ||
                    message.contains("account not found") ||
                    message.contains("invalid param")

            if (ataMissing) {
                0.0
            } else {
                throw Exception("Failed to fetch SKR balance: ${e.message}", e)
            }
        }
    }

    suspend fun fetchSolBalance(walletAddress: String): Long = withContext(Dispatchers.IO) {
        connection.getBalance(PublicKey(walletAddress)).toLong()
    }

    suspend fun verifyTreasuryATA(): TreasuryVerification = withContext(Dispatchers.IO) {
        try {
            val treasuryWallet = PublicKey(SeekerBurnConfig.TREASURY_WALLET)
            val expectedATA = deriveATA(treasuryWallet, skrMint)
            val derivationMatch = expectedATA == treasuryATA
            val accountInfo = connection.getAccountInfo(treasuryATA)
            val exists = accountInfo != null
            TreasuryVerification(derivationMatch, exists, derivationMatch && exists)
        } catch (e: Exception) {
            TreasuryVerification(false, false, false, e.message)
        }
    }

    suspend fun fetchTreasuryBalance(): Double = withContext(Dispatchers.IO) {
        try {
            val balance = connection.getTokenAccountBalance(treasuryATA)
            balance.uiAmount.toDoubleOrNull() ?: 0.0
        } catch (e: Exception) {
            0.0
        }
    }

    // ── Preflight Checks ──

    /**
     * Check if the user's SKR token account is frozen.
     * A frozen account cannot burn or transfer tokens — must surface this to the user.
     * SPL Token account layout: offset 108 = state (1 byte): 0=Uninitialized, 1=Initialized, 2=Frozen
     */
    suspend fun isAccountFrozen(walletAddress: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val wallet = PublicKey(walletAddress)
            val ata = deriveATA(wallet, skrMint)
            val accountInfo = connection.getAccountInfo(ata)
            val data = accountInfo?.data ?: return@withContext false // no account = not frozen
            if (data.size < 109) return@withContext false
            val state = data[108].toInt() and 0xFF
            state == 2 // 2 = Frozen
        } catch (_: Exception) {
            false // If we can't check, assume not frozen (burn will fail on-chain anyway)
        }
    }

    /**
     * Run preflight checks before building a burn transaction.
     * Returns a list of issues found. Empty list = all clear.
     */
    suspend fun preflightBurnChecks(walletAddress: String): List<String> = withContext(Dispatchers.IO) {
        val issues = mutableListOf<String>()

        // 1. Verify treasury ATA derivation matches config
        val treasuryVerification = verifyTreasuryATA()
        if (!treasuryVerification.allPassed) {
            issues.add("Treasury ATA verification failed: ${treasuryVerification.error ?: "derivation mismatch"}")
        }

        // 2. Check if user's account is frozen
        if (isAccountFrozen(walletAddress)) {
            issues.add("Your SKR token account is frozen. Please contact support.")
        }

        issues
    }

    // ── Transaction Building ──

    suspend fun buildBurnTransaction(
        walletAddress: String,
        burnAmountBaseUnits: Long,
        feeAmountBaseUnits: Long,
    ): ByteArray = withContext(Dispatchers.IO) {
        val wallet = PublicKey(walletAddress)
        val userATA = deriveATA(wallet, skrMint)
        val recentBlockhash = connection.getLatestBlockhash()

        val instructions = mutableListOf<Instruction>()
        instructions.add(buildSplBurnInstruction(userATA, skrMint, wallet, burnAmountBaseUnits))

        if (feeAmountBaseUnits > 0) {
            instructions.add(buildSplTransferInstruction(userATA, treasuryATA, wallet, feeAmountBaseUnits))
        }

        // MWA wire format requires: [compact-u16: numSigs=1] [64 zero-byte placeholder] [message...]
        // Without a pre-filled signature slot, serialize() emits numSigs=0 but the message
        // header declares numRequiredSignatures=1 — the Seed Vault rejects this with
        // "transaction is not properly formed, can't be signed".
        // addSignature() is private in sol4k 0.5.3, so we patch the raw bytes instead:
        //   serialize() always starts with encodeLength(0)=0x00 when unsigned;
        //   we strip that byte and prepend [0x01] + 64 zero-byte placeholder.
        val tx = Transaction(recentBlockhash, instructions, wallet)
        return@withContext withSignaturePlaceholder(tx.serialize())
    }

    suspend fun buildDepositTransaction(
        walletAddress: String,
        amountBaseUnits: Long,
    ): ByteArray = withContext(Dispatchers.IO) {
        val wallet = PublicKey(walletAddress)
        val userATA = deriveATA(wallet, skrMint)
        val recentBlockhash = connection.getLatestBlockhash()

        // Same wire-format fix as buildBurnTransaction — placeholder signature required.
        val tx = Transaction(
            recentBlockhash,
            listOf(buildSplTransferInstruction(userATA, treasuryATA, wallet, amountBaseUnits)),
            wallet,
        )
        return@withContext withSignaturePlaceholder(tx.serialize())
    }

    // ── Raw SPL instruction builders ──

    private fun buildSplBurnInstruction(
        source: PublicKey, mint: PublicKey, owner: PublicKey, amount: Long,
    ): Instruction {
        val data = ByteArray(9)
        data[0] = SPL_TOKEN_BURN
        putLongLE(data, 1, amount)
        // sol4k 0.5.3: BaseInstruction(data, keys, programId)
        return BaseInstruction(
            data,
            listOf(
                AccountMeta.writable(source),  // source ATA (writable)
                AccountMeta.writable(mint),    // mint (writable)
                AccountMeta.signer(owner),     // authority (signer)
            ),
            TOKEN_PROGRAM,
        )
    }

    private fun buildSplTransferInstruction(
        source: PublicKey, destination: PublicKey, owner: PublicKey, amount: Long,
    ): Instruction {
        val data = ByteArray(9)
        data[0] = SPL_TOKEN_TRANSFER
        putLongLE(data, 1, amount)
        return BaseInstruction(
            data,
            listOf(
                AccountMeta.writable(source),       // source ATA (writable)
                AccountMeta.writable(destination),   // destination ATA (writable)
                AccountMeta.signer(owner),           // authority (signer)
            ),
            TOKEN_PROGRAM,
        )
    }

    private fun putLongLE(buf: ByteArray, offset: Int, value: Long) {
        for (i in 0 until 8) buf[offset + i] = (value shr (i * 8) and 0xFF).toByte()
    }

    /**
     * sol4k 0.5.3's Transaction.serialize() outputs [0x00][message] when unsigned
     * (compact-u16 signature count = 0).  MWA requires the count to equal the number of
     * required signers declared in the message header, with each slot pre-filled with
     * 64 zero bytes so the wallet knows where to write the real signature.
     *
     * This function replaces the leading 0x00 with [0x01][64 zero bytes], producing
     * valid partial-signed wire format that every MWA-compatible wallet accepts.
     */
    private fun withSignaturePlaceholder(unsigned: ByteArray): ByteArray {
        // unsigned[0] == 0x00  (encodeLength(0))
        // Result: [0x01] + 64×0x00 + unsigned.drop(1)
        val out = ByteArray(1 + 64 + unsigned.size - 1)
        out[0] = 0x01
        // bytes 1..64 are already 0x00 (default)
        unsigned.copyInto(out, destinationOffset = 65, startIndex = 1)
        return out
    }

    /** Derive Associated Token Account address for a wallet + mint pair. */
    private fun deriveATA(wallet: PublicKey, mint: PublicKey): PublicKey {
        // sol4k 0.5.3: findProgramAddress(seeds: List<PublicKey>, programId: PublicKey)
        val pda = PublicKey.findProgramAddress(
            listOf(wallet, TOKEN_PROGRAM, mint),
            ATA_PROGRAM,
        )
        return pda.publicKey
    }
}

data class TreasuryVerification(
    val derivationMatch: Boolean,
    val accountExists: Boolean,
    val allPassed: Boolean,
    val error: String? = null,
)
