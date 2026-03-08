package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.theme.SeekerBurnTheme
import club.seekerburn.app.util.FormatUtils
import club.seekerburn.app.viewmodel.ActivityTypeUi
import club.seekerburn.app.viewmodel.ActivityViewModel

/**
 * Activity / History screen.
 * Groups entries by date. Shows burns, deposits, and badge mints.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivityScreen(
    onBack: () -> Unit,
    onViewExplorer: (String) -> Unit,
    viewModel: ActivityViewModel = hiltViewModel(),
) {
    val colors = SeekerBurnTheme.colors
    val uiState by viewModel.uiState.collectAsState()
    val grouped = remember(uiState.items) { uiState.items.groupBy { it.dateLabel } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Activity") },
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
        if (uiState.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = colors.primary)
            }
        } else if (uiState.error != null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = uiState.error.orEmpty(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.error,
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(onClick = { viewModel.refresh() }) {
                    Text("Retry")
                }
            }
        } else if (uiState.items.isEmpty()) {
            // Empty state
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                BurnIcon(icon = BurnIcons.Clipboard, contentDescription = "No activity", size = 48.dp)
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    "No activity yet",
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textSecondary,
                )
                Text(
                    "Your burn history will appear here",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textTertiary,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                grouped.forEach { (date, items) ->
                    // Date header
                    item(key = "header_$date") {
                        Text(
                            text = date,
                            style = MaterialTheme.typography.labelLarge,
                            color = colors.textTertiary,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                        )
                    }

                    items(items, key = { "${it.dateLabel}_${it.title}_${it.signature}" }) { item ->
                        ActivityRow(
                            item = item,
                            onClick = {
                                item.signature?.let { sig ->
                                    onViewExplorer(FormatUtils.solscanTxUrl(sig))
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ActivityRow(
    item: club.seekerburn.app.viewmodel.ActivityItemUi,
    onClick: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors
    val hasLink = item.signature != null

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (hasLink) Modifier.clickable(onClick = onClick) else Modifier),
        shape = RoundedCornerShape(12.dp),
        color = colors.surfaceElevated,
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Type icon
            Surface(
                modifier = Modifier.size(40.dp),
                shape = CircleShape,
                color = when (item.type) {
                    ActivityTypeUi.BURN -> colors.primary.copy(alpha = 0.15f)
                    ActivityTypeUi.DEPOSIT -> colors.secondary.copy(alpha = 0.15f)
                },
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = when (item.type) {
                            ActivityTypeUi.BURN -> "B"
                            ActivityTypeUi.DEPOSIT -> "D"
                        },
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textPrimary,
                )
                if (item.signature != null) {
                    val displaySig = FormatUtils.truncateSignature(item.signature, 6, 6)
                    Text(
                        text = displaySig,
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textTertiary,
                    )
                }
            }

            if (hasLink) {
                Text("→", color = colors.textTertiary)
            }
        }
    }
}
