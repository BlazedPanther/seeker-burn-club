package club.seekerburn.app.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import club.seekerburn.app.R

/**
 * Custom vector icon library — replaces all emoji usage with crisp SVG drawables.
 * Every icon aligns with the SeekerBurn brand palette.
 */
object BurnIcons {
    val Flame = R.drawable.ic_flame
    val FlameLarge = R.drawable.ic_flame_large
    val CheckCircle = R.drawable.ic_check_circle_filled
    val Trophy = R.drawable.ic_trophy
    val Wave = R.drawable.ic_wave
    val Prohibited = R.drawable.ic_prohibited
    val WalletEmpty = R.drawable.ic_wallet_empty
    val Gas = R.drawable.ic_gas
    val SignalOff = R.drawable.ic_signal_off
    val Timer = R.drawable.ic_timer
    val Snowflake = R.drawable.ic_snowflake
    val AlertTriangle = R.drawable.ic_alert_triangle
    val Clipboard = R.drawable.ic_clipboard
    val Vault = R.drawable.ic_vault
    val Heart = R.drawable.ic_heart
    val MedalGold = R.drawable.ic_medal_gold
    val MedalSilver = R.drawable.ic_medal_silver
    val MedalBronze = R.drawable.ic_medal_bronze
    val Ticket = R.drawable.ic_ticket
    val Party = R.drawable.ic_party
    val CrossCircle = R.drawable.ic_cross_circle
    val Lock = R.drawable.ic_lock
    val Gem = R.drawable.ic_gem
    val Share = R.drawable.ic_share
    val Verified = R.drawable.ic_verified

    // Lucky Burns item icons
    val Lightning = R.drawable.ic_lightning
    val DoubleLightning = R.drawable.ic_double_lightning
    val ShieldPlus = R.drawable.ic_shield_plus
    val ShieldStack = R.drawable.ic_shield_stack
    val Clover = R.drawable.ic_clover
    val Crown = R.drawable.ic_crown
    val Starburst = R.drawable.ic_starburst
    val Spiral = R.drawable.ic_spiral
    val EternalFlame = R.drawable.ic_eternal_flame
    val StarGlow = R.drawable.ic_star_glow
    val Volcano = R.drawable.ic_volcano
    val Swords = R.drawable.ic_swords
}

/**
 * Map Lucky Burns item IDs to their pixel icon resource.
 */
fun luckyItemIcon(itemId: String): Int = when (itemId) {
    "xp_spark" -> BurnIcons.Starburst
    "xp_ember" -> BurnIcons.Flame
    "mini_boost" -> BurnIcons.Lightning
    "streak_shield_drop" -> BurnIcons.ShieldPlus
    "xp_flame" -> BurnIcons.Flame
    "lucky_charm" -> BurnIcons.Clover
    "xp_inferno" -> BurnIcons.Gem
    "double_boost" -> BurnIcons.DoubleLightning
    "challenge_skip" -> BurnIcons.Ticket
    "golden_burn" -> BurnIcons.Crown
    "shield_pack" -> BurnIcons.ShieldStack
    "xp_supernova" -> BurnIcons.Starburst
    "triple_boost" -> BurnIcons.DoubleLightning
    "entropy_flame" -> BurnIcons.Volcano
    "mega_luck" -> BurnIcons.StarGlow
    "singularity_core" -> BurnIcons.Spiral
    "eternal_flame" -> BurnIcons.EternalFlame
    else -> BurnIcons.Gem
}

/**
 * Map buff type IDs to their pixel icon resource.
 */
fun buffIcon(buffType: String): Int = when (buffType) {
    "XP_BOOST" -> BurnIcons.Lightning
    "GOLDEN_BURN" -> BurnIcons.Crown
    "LOOT_LUCK" -> BurnIcons.Clover
    else -> BurnIcons.Flame
}

/**
 * Renders a custom vector drawable at the given size.
 */
@Composable
fun BurnIcon(
    @DrawableRes icon: Int,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
) {
    Image(
        painter = painterResource(id = icon),
        contentDescription = contentDescription,
        modifier = modifier.size(size),
    )
}
