package club.seekerburn.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import club.seekerburn.app.ui.components.BurnCard
import club.seekerburn.app.ui.components.BurnIcon
import club.seekerburn.app.ui.components.BurnIcons
import club.seekerburn.app.ui.components.pixelBorder
import club.seekerburn.app.ui.theme.PressStart2P
import club.seekerburn.app.ui.theme.SeekerBurnTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HowItWorksScreen(
    onBack: () -> Unit,
) {
    val colors = SeekerBurnTheme.colors

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "How It Works",
                        fontFamily = PressStart2P,
                        fontSize = 14.sp,
                    )
                },
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ── Burning ──
            GuideSection(
                icon = BurnIcons.Flame,
                title = "BURNING SKR",
                items = listOf(
                    "Burn Seeker (SKR) tokens daily to build your streak and earn XP.",
                    "A small platform fee goes to the Community Treasury on every burn.",
                    "The more consistently you burn, the faster you level up.",
                ),
            )

            // ── Streaks ──
            GuideSection(
                icon = BurnIcons.Flame,
                title = "STREAKS",
                items = listOf(
                    "Burn at least once per UTC day to keep your streak alive.",
                    "Longer streaks unlock higher XP multipliers:",
                    "  Day 1\u20136 \u2192 1.0x  \u2022  Day 7\u201329 \u2192 1.5x",
                    "  Day 30\u201399 \u2192 2.0x  \u2022  Day 100+ \u2192 3.0x",
                    "Streak Shields protect your streak if you miss a day.",
                ),
            )

            // ── XP & Levels ──
            GuideSection(
                icon = BurnIcons.Lightning,
                title = "XP & LEVELS",
                items = listOf(
                    "Earn XP from daily burns, challenges, badges, and lucky drops.",
                    "Levels scale infinitely \u2014 the higher you go, the harder it gets.",
                    "Every 5 levels you earn a free Streak Shield.",
                    "29 unique titles from Ash to Legend \u2014 grind to unlock them all.",
                ),
            )

            // ── Challenges ──
            GuideSection(
                icon = BurnIcons.Trophy,
                title = "CHALLENGES",
                items = listOf(
                    "3 Daily Challenges rotate each day (100\u2013300 XP each).",
                    "Complete all 3 for a Daily Sweep bonus (+500 XP).",
                    "2 Weekly Challenges rotate each week (800\u20132000 XP each).",
                    "Some weekly challenges also reward Streak Shields.",
                ),
            )

            // ── Lucky Burns ──
            GuideSection(
                icon = BurnIcons.StarGlow,
                title = "LUCKY BURNS",
                items = listOf(
                    "Every burn of 3+ SKR has a chance to drop a random item (per burn, not 3/day).",
                    "Drop chance increases with your streak (8\u201325%).",
                    "6 rarity tiers: Common, Uncommon, Rare, Epic, Legendary, Mythic.",
                    "Items include instant XP, XP multipliers, Streak Shields, and more.",
                    "Active buffs boost your next burns \u2014 check your Inventory.",
                ),
            )

            // ── Shield Shop ──
            GuideSection(
                icon = BurnIcons.ShieldPlus,
                title = "SHIELD SHOP",
                items = listOf(
                    "Buy Streak Shields with SKR tokens.",
                    "Shields automatically protect your streak if you miss a day.",
                    "Price is based on live SKR market rate via Jupiter.",
                ),
            )

            // ── Badges & NFTs ──
            GuideSection(
                icon = BurnIcons.Verified,
                title = "BADGES & BURN SPIRITS",
                items = listOf(
                    "Unlock badges for streak milestones, lifetime burns, and more.",
                    "Each badge generates a unique pixel creature \u2014 your Burn Spirit.",
                    "Claim Burn Spirits as Solana NFTs (compressed cNFTs).",
                    "14 trillion+ trait combinations \u2014 no two are alike.",
                    "Badges also award 500\u20135000 XP depending on difficulty.",
                ),
            )

            // ── Referrals ──
            GuideSection(
                icon = BurnIcons.Heart,
                title = "REFERRALS",
                items = listOf(
                    "Share your referral code and earn 10% of your referrals' burn XP.",
                    "Your referrals also get a 5% XP bonus on every burn.",
                    "Both parties benefit \u2014 grow together.",
                ),
            )

            // ── Treasury ──
            GuideSection(
                icon = BurnIcons.Vault,
                title = "COMMUNITY TREASURY",
                items = listOf(
                    "Platform fees fund the Community Treasury.",
                    "Treasury funds future rewards, events, and community initiatives.",
                    "Fully transparent \u2014 view the treasury balance anytime.",
                ),
            )

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun GuideSection(
    icon: Int,
    title: String,
    items: List<String>,
) {
    val colors = SeekerBurnTheme.colors

    BurnCard {
        Column(modifier = Modifier.padding(4.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                BurnIcon(icon = icon, contentDescription = null, size = 18.dp)
                Text(
                    text = title,
                    fontFamily = PressStart2P,
                    fontSize = 10.sp,
                    color = colors.primary,
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            items.forEach { line ->
                Row(
                    modifier = Modifier.padding(vertical = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (!line.startsWith("  ")) {
                        Box(
                            modifier = Modifier
                                .padding(top = 6.dp)
                                .size(4.dp)
                                .background(colors.primary)
                        )
                    }
                    Text(
                        text = line.trimStart(),
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textSecondary,
                        lineHeight = 18.sp,
                    )
                }
            }
        }
    }
}
