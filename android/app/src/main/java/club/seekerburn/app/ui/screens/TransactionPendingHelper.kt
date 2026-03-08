package club.seekerburn.app.ui.screens

import androidx.lifecycle.ViewModel
import club.seekerburn.app.data.api.SeekerBurnApi
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * Helper ViewModel to inject API into TransactionPendingScreen.
 */
@HiltViewModel
class TransactionPendingHelper @Inject constructor(
    val api: SeekerBurnApi,
) : ViewModel()
