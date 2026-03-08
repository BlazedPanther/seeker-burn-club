package club.seekerburn.app.data.solana

import android.net.Uri
import android.util.Log
import club.seekerburn.app.BuildConfig
import club.seekerburn.app.config.SeekerBurnConfig
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.DefaultTransactionParams
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wrapper around Solana Mobile Wallet Adapter (MWA 2.0.3) for Seed Vault interaction.
 *
 * transact() takes a suspend lambda: suspend (AdapterOperations, AuthorizationResult) -> T
 * Authorization/reauthorization is handled automatically by the adapter.
 *
 * TransactionResult sealed: Success<T>, Failure, NoWalletFound
 * Success.payload: T, Success.authResult: AuthorizationResult
 * AuthorizationResult: authToken, publicKey, accounts[], accountLabel, walletUriBase
 */
@Singleton
class WalletAdapterService @Inject constructor() {

    private companion object {
        const val TAG = "WalletAdapterService"
    }

    @Volatile private var savedAuthToken: String? = null
    @Volatile private var walletPublicKey: ByteArray? = null

    val isConnected: Boolean get() = savedAuthToken != null && walletPublicKey != null

    val publicKeyBase58: String?
        get() = walletPublicKey?.let { org.sol4k.Base58.encode(it) }

    private fun createAdapter(): MobileWalletAdapter {
        val identity = ConnectionIdentity(
            Uri.parse(SeekerBurnConfig.APP_IDENTITY_URI),
            Uri.parse(SeekerBurnConfig.APP_ICON_URI),
            SeekerBurnConfig.APP_IDENTITY_NAME,
        )
        return MobileWalletAdapter(identity).also { adapter ->
            adapter.authToken = savedAuthToken
            adapter.blockchain = SeekerBurnConfig.SOLANA_BLOCKCHAIN
        }
    }

    /**
     * Authorize with the wallet (first-time or reauthorize).
     * @return base58 public key of the authorized wallet.
     */
    suspend fun authorize(sender: ActivityResultSender): String = withContext(Dispatchers.IO) {
        if (BuildConfig.DEBUG) Log.i(TAG, "Starting wallet authorization")
        val adapter = createAdapter()

        val result = adapter.transact(sender = sender, signInPayload = null) { authResult ->
            authResult
        }

        when (result) {
            is TransactionResult.Success -> {
                val authResult = result.authResult
                savedAuthToken = authResult.authToken
                val publicKey = authResult.accounts.firstOrNull()?.publicKey
                    ?: throw Exception("Wallet authorization returned no account public key")
                walletPublicKey = publicKey
                if (BuildConfig.DEBUG) Log.i(TAG, "Wallet authorized successfully")
                org.sol4k.Base58.encode(publicKey)
            }
            is TransactionResult.Failure -> {
                if (BuildConfig.DEBUG) Log.e(TAG, "Authorization failed: ${result.message}")
                throw Exception("Authorization failed: ${result.message}")
            }
            is TransactionResult.NoWalletFound -> {
                if (BuildConfig.DEBUG) Log.e(TAG, "No wallet found: ${result.message}")
                throw Exception("No wallet found: ${result.message}")
            }
            else -> throw Exception("Unknown result type")
        }
    }

    /**
     * Sign a message (for SIWS authentication).
     */
    suspend fun signMessage(sender: ActivityResultSender, message: ByteArray): ByteArray =
        withContext(Dispatchers.IO) {
            val adapter = createAdapter()
            val pubKey = walletPublicKey ?: throw Exception("Not connected")

            val result = adapter.transact(sender = sender, signInPayload = null) {
                signMessagesDetached(arrayOf(message), arrayOf(pubKey))
            }

            when (result) {
                is TransactionResult.Success -> result.payload.messages[0].signatures[0]
                is TransactionResult.Failure -> {
                    if (BuildConfig.DEBUG) Log.e(TAG, "Message signing failed: ${result.message}")
                    throw Exception("Sign failed: ${result.message}")
                }
                is TransactionResult.NoWalletFound -> {
                    if (BuildConfig.DEBUG) Log.e(TAG, "No wallet found while signing")
                    throw Exception("No wallet found")
                }
                else -> throw Exception("Unknown result type")
            }
        }

    /**
     * Sign and send a serialized transaction.
     * @return transaction signature as base58.
     */
    suspend fun signAndSendTransaction(
        sender: ActivityResultSender,
        serializedTransaction: ByteArray,
    ): String = withContext(Dispatchers.IO) {
        val adapter = createAdapter()

        val result = adapter.transact(sender = sender, signInPayload = null) {
            signAndSendTransactions(arrayOf(serializedTransaction), DefaultTransactionParams)
        }

        when (result) {
            is TransactionResult.Success -> {
                val sigs = result.payload.signatures
                if (sigs.isEmpty()) throw Exception("MWA returned success but no signatures")
                org.sol4k.Base58.encode(sigs[0])
            }
            is TransactionResult.Failure -> {
                if (BuildConfig.DEBUG) Log.e(TAG, "signAndSendTransactions failed: ${result.message}")
                throw Exception("Transaction failed: ${result.message}")
            }
            is TransactionResult.NoWalletFound -> {
                if (BuildConfig.DEBUG) Log.e(TAG, "No wallet found while sending transaction")
                throw Exception("No wallet found")
            }
            else -> throw Exception("Unknown result type")
        }
    }

    /**
     * Disconnect and clear session.
     */
    fun disconnect() {
        savedAuthToken = null
        walletPublicKey = null
    }
}
