package club.seekerburn.app.ui.screens

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.foundation.Image
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils
import club.seekerburn.app.viewmodel.ReferralViewModel
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReferralScreen(
    onBack: () -> Unit,
    viewModel: ReferralViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val uiState by viewModel.uiState.collectAsState()
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val isReferralCodeValid = Regex("^SBC-[A-Z2-9]{8}$").matches(uiState.inputCode.trim())

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Referrals") },
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
        if (uiState.isLoading && uiState.overview == null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(modifier = Modifier.padding(start = 20.dp), color = colors.primary)
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            val overview = uiState.overview

            uiState.error?.let {
                Spacer(modifier = Modifier.height(8.dp))
                Text(it, color = colors.error, style = MaterialTheme.typography.bodySmall)
            }

            if (overview != null) {
                val referralShareText = remember(overview.referralCode) {
                    "Join me on Seeker Burn Club. Use my referral code: ${overview.referralCode}\n\nhttps://seekerburnclub.xyz"
                }
                val referralQrBitmap = remember(overview.referralCode) {
                    createReferralQrBitmap(overview.referralCode, 420)
                }

                Spacer(modifier = Modifier.height(12.dp))

                Surface(color = colors.surfaceElevated, tonalElevation = 0.dp) {
                    Column(modifier = Modifier.fillMaxWidth().padding(14.dp)) {
                        Text("Your Referral Code", color = colors.textSecondary, style = MaterialTheme.typography.labelMedium)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = overview.referralCode,
                            color = colors.primary,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "This is your permanent referral code.",
                            color = colors.textTertiary,
                            style = MaterialTheme.typography.bodySmall,
                            textAlign = TextAlign.Start,
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { clipboard.setText(AnnotatedString(overview.referralCode)) }) {
                                Text("Copy Code")
                            }
                            OutlinedButton(
                                onClick = {
                                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                        putExtra(Intent.EXTRA_TEXT, referralShareText)
                                        type = "text/plain"
                                    }
                                    context.startActivity(Intent.createChooser(sendIntent, "Share referral code"))
                                },
                            ) {
                                Text("Share")
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Scan to share", color = colors.textSecondary, style = MaterialTheme.typography.labelMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(color = colors.textOnPrimary) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(10.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Image(
                                    bitmap = referralQrBitmap.asImageBitmap(),
                                    contentDescription = "Referral code QR",
                                    modifier = Modifier
                                        .fillMaxWidth(0.56f)
                                        .height(190.dp),
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    StatChip("Invited", overview.stats.invited.toString(), Modifier.weight(1f))
                    StatChip("Qualified", overview.stats.qualified.toString(), Modifier.weight(1f))
                }
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    StatChip("Pending", overview.stats.pending.toString(), Modifier.weight(1f))
                    StatChip("Rejected", overview.stats.rejected.toString(), Modifier.weight(1f))
                }

                overview.referredBy?.let { info ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Surface(color = colors.surfaceElevated2) {
                        Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                            Text("Referred By", color = colors.textSecondary, style = MaterialTheme.typography.labelMedium)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(FormatUtils.truncateAddress(info.walletAddress), color = colors.textPrimary)
                            info.referralCode?.let { Text("Code: $it", color = colors.textTertiary, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }

                if (overview.canApplyReferral) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Apply Referral Code", color = colors.textPrimary, style = MaterialTheme.typography.titleSmall)
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = uiState.inputCode,
                        onValueChange = viewModel::updateInput,
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("e.g. SBC-ABCDEFG2") },
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Format: SBC-XXXXXXXX",
                        color = colors.textTertiary,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    uiState.applyError?.let {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(it, color = colors.error, style = MaterialTheme.typography.bodySmall)
                    }
                    uiState.applySuccess?.let {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(it, color = colors.success, style = MaterialTheme.typography.bodySmall)
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    Button(
                        onClick = { viewModel.applyCode() },
                        enabled = !uiState.isApplying && isReferralCodeValid,
                        colors = ButtonDefaults.buttonColors(containerColor = colors.primary, contentColor = colors.textOnPrimary),
                    ) {
                        if (uiState.isApplying) {
                            CircularProgressIndicator(color = colors.textOnPrimary, modifier = Modifier.width(16.dp).height(16.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text("Apply")
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))
                Text("Referral History", color = colors.textPrimary, style = MaterialTheme.typography.titleSmall)
                Spacer(modifier = Modifier.height(8.dp))

                if (uiState.history.isEmpty()) {
                    Text("No referrals yet.", color = colors.textTertiary, style = MaterialTheme.typography.bodySmall)
                } else {
                    uiState.history.forEach { item ->
                        Surface(color = colors.surfaceElevated, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(item.truncatedRefereeWallet, color = colors.textPrimary)
                                Text("Status: ${item.status}", color = colors.textSecondary, style = MaterialTheme.typography.bodySmall)
                                item.rejectionReason?.let {
                                    Text("Reason: $it", color = colors.error, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

private fun createReferralQrBitmap(content: String, sizePx: Int): Bitmap {
    val bitMatrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    for (x in 0 until sizePx) {
        for (y in 0 until sizePx) {
            bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
        }
    }
    return bitmap
}

@Composable
private fun StatChip(label: String, value: String, modifier: Modifier = Modifier) {
    val colors = SeekerBurnTheme.colors
    Surface(color = colors.surfaceElevated, modifier = modifier) {
        Column(modifier = Modifier.fillMaxWidth().padding(10.dp)) {
            Text(label, color = colors.textTertiary, style = MaterialTheme.typography.labelSmall)
            Spacer(modifier = Modifier.height(2.dp))
            Text(value, color = colors.primary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

