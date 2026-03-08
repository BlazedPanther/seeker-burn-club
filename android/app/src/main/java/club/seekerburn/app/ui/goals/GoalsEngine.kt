package club.seekerburn.app.ui.goals

import club.seekerburn.app.config.SeekerBurnConfig
import club.seekerburn.app.viewmodel.HomeUiState
import java.time.ZonedDateTime
import java.time.temporal.IsoFields
import kotlin.math.abs

/**
 * Pure-logic engine for Daily Missions, Weekly Quests, and Milestones.
 *
 * All time-based seeding uses [ZonedDateTime].
 *
 * — Daily missions rotate at local midnight.
 * — Weekly quests rotate at Monday 00:00 UTC (same boundary as backend weekly stats).
 * — Milestones are always derived from authoritative backend values.
 */
object GoalsEngine {

    // ── Public data classes ──────────────────────────────────────────────────

    data class DailyMission(
        val id: String,
        val title: String,
        val description: String,
        val currentLabel: String,
        val progress: Float,        // 0f..1f
        val isCompleted: Boolean,
    )

    data class WeeklyQuest(
        val id: String,
        val title: String,
        val description: String,
        val currentLabel: String,
        val progress: Float,
        val isCompleted: Boolean,
    )

    data class Milestone(
        val title: String,
        val subtitle: String,
        val currentLabel: String,
        val targetLabel: String,
        val progress: Float,
        val isCompleted: Boolean,
    )

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Compact SKR number label: 1000 → "1K", 1_000_000 → "1M", etc. */
    private fun skrLabel(v: Double): String = when {
        v >= 1_000_000.0 -> "${(v / 1_000_000.0).toLong()}M"
        v >= 1_000.0     -> "${(v / 1_000.0).toLong()}K"
        v == v.toLong().toDouble() -> v.toLong().toString()
        else             -> "%.0f".format(v)
    }

    /** Amount-mission target scales with user's lifetime burned level. */
    private fun amountTier(lifetimeBurned: Double): Double = when {
        lifetimeBurned < 50.0    ->  5.0
        lifetimeBurned < 500.0   -> 10.0
        lifetimeBurned < 5_000.0 -> 50.0
        else                     -> 100.0
    }

    // ── Daily missions ───────────────────────────────────────────────────────

    private enum class DailyTemplate {
        IGNITE, INCINERATE, HOLD_LINE, DAWN_PROTOCOL, NIGHTFIRE, THE_RITUAL
    }

    /**
    * Returns exactly 3 daily missions for [now] in the device's local timezone.
     * IGNITE (burn anything) is always one of the three; the other two rotate
     * deterministically by [epochDay × wallet hash].
     */
    fun dailyMissions(state: HomeUiState, now: ZonedDateTime): List<DailyMission> {
        val dayEpoch  = now.toLocalDate().toEpochDay()   // flips at local midnight ✓
        val wHash     = abs(state.walletAddress.hashCode())
        val daySeed   = abs((dayEpoch + wHash).toInt())

        val burned    = state.hasBurnedToday
        val hour      = now.hour
        val amtTarget = amountTier(state.lifetimeBurned)

        // Rotation pool: everything except IGNITE (which is always shown)
        val pool = listOf(
            DailyTemplate.INCINERATE,
            DailyTemplate.HOLD_LINE,
            DailyTemplate.DAWN_PROTOCOL,
            DailyTemplate.NIGHTFIRE,
            DailyTemplate.THE_RITUAL,
        )
        val poolSize = pool.size
        val a = pool[daySeed % poolSize]
        val b = pool[(daySeed / poolSize + 1) % poolSize].let {
            if (it == a) pool[(daySeed / poolSize + 2) % poolSize] else it
        }

        return listOf(DailyTemplate.IGNITE, a, b).map { t ->
            buildDaily(t, burned, hour, amtTarget, state.currentStreak)
        }
    }

    private fun buildDaily(
        t: DailyTemplate,
        burned: Boolean,
        hour: Int,
        amtTarget: Double,
        streak: Int,
    ): DailyMission = when (t) {

        DailyTemplate.IGNITE -> DailyMission(
            id          = "ignite",
            title       = "IGNITE",
            description = "Execute any burn today",
            currentLabel = if (burned) "COMPLETE" else "PENDING",
            progress    = if (burned) 1f else 0f,
            isCompleted = burned,
        )

        DailyTemplate.INCINERATE -> DailyMission(
            id          = "incinerate",
            title       = "INCINERATE ${skrLabel(amtTarget)} SKR",
            description = "Burn ≥ ${skrLabel(amtTarget)} SKR today",
            currentLabel = if (burned) "${skrLabel(amtTarget)} / ${skrLabel(amtTarget)} SKR ✓"
                           else        "0 / ${skrLabel(amtTarget)} SKR",
            progress    = if (burned) 1f else 0f,
            isCompleted = burned,
        )

        DailyTemplate.HOLD_LINE -> DailyMission(
            id          = "hold_line",
            title       = "HOLD THE LINE",
            description = "Keep your $streak-day streak alive",
            currentLabel = if (burned) "STREAK SAFE ✓" else "BURN TO SURVIVE",
            progress    = if (burned) 1f else 0f,
            isCompleted = burned,
        )

        DailyTemplate.DAWN_PROTOCOL -> DailyMission(
            id          = "dawn",
            title       = "DAWN PROTOCOL",
            description = "Burn before 12:00 (local time)",
            currentLabel = when {
                burned && hour < 12 -> "EARLY STRIKE ✓"
                burned              -> "DONE (LATE)"
                else                -> "BURN BEFORE 12:00"
            },
            progress    = if (burned) 1f else 0f,
            isCompleted = burned,
        )

        DailyTemplate.NIGHTFIRE -> DailyMission(
            id          = "nightfire",
            title       = "NIGHTFIRE",
            description = "Burn after 18:00 (local time)",
            currentLabel = when {
                burned && hour >= 18 -> "NIGHTFIRE COMPLETE ✓"
                burned               -> "DONE (DAY BURN)"
                else                 -> "BURN AFTER 18:00"
            },
            progress    = if (burned) 1f else 0f,
            isCompleted = burned,
        )

        DailyTemplate.THE_RITUAL -> DailyMission(
            id          = "ritual",
            title       = "THE RITUAL",
            description = "Your daily burn ritual awaits",
            currentLabel = if (burned) "RITUAL COMPLETE ✓" else "AWAITING SACRIFICE",
            progress    = if (burned) 1f else 0f,
            isCompleted = burned,
        )
    }

    // ── Weekly quests ────────────────────────────────────────────────────────

    private enum class WeeklyTemplate {
        DISCIPLINE,
        WEEKLY_GRIND,
        HEATWAVE,
        CONSISTENCY_PLUS,
    }

    /**
      * Returns 2 weekly quests for the ISO week containing [now] (UTC).
     * Progress uses backend-authoritative [HomeUiState.weeklyBurnDays] /
     * [HomeUiState.weeklyBurnSKR] (UTC-based, resets Monday 00:00 UTC).
     */
    fun weeklyQuests(state: HomeUiState, now: ZonedDateTime): List<WeeklyQuest> {
          val isoWeek = now.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
          val isoWeekYear = now.get(IsoFields.WEEK_BASED_YEAR)
        val wHash    = abs(state.walletAddress.hashCode())
          val weekSeed = abs((isoWeekYear * 100 + isoWeek) + wHash)

        val weeklyDays = state.weeklyBurnDays
        val weeklySkr  = state.weeklyBurnSKR

        // Days target: alternates 4 / 5 by week seed
        val daysTarget = if (weekSeed % 2 == 0) 4 else 5

        // Volume target scales with user level
        val volumeTarget = when {
            state.lifetimeBurned < 50.0    ->  10.0
            state.lifetimeBurned < 500.0   ->  50.0
            state.lifetimeBurned < 5_000.0 -> 250.0
            else                           -> 1_000.0
        }

        val templates = listOf(
            WeeklyTemplate.DISCIPLINE,
            WeeklyTemplate.WEEKLY_GRIND,
            WeeklyTemplate.HEATWAVE,
            WeeklyTemplate.CONSISTENCY_PLUS,
        )
        val first = templates[weekSeed % templates.size]
        val second = templates[(weekSeed / templates.size + 1) % templates.size].let {
            if (it == first) templates[(weekSeed / templates.size + 2) % templates.size] else it
        }

        fun buildWeekly(template: WeeklyTemplate): WeeklyQuest = when (template) {
            WeeklyTemplate.DISCIPLINE -> WeeklyQuest(
                id = "weekly_discipline",
                title = "THE DISCIPLINE",
                description = "Burn on $daysTarget different days this week",
                currentLabel = "$weeklyDays / $daysTarget days",
                progress = (weeklyDays.toFloat() / daysTarget.toFloat()).coerceIn(0f, 1f),
                isCompleted = weeklyDays >= daysTarget,
            )

            WeeklyTemplate.WEEKLY_GRIND -> WeeklyQuest(
                id = "weekly_grind",
                title = "WEEKLY GRIND",
                description = "Burn ${skrLabel(volumeTarget)} SKR total this week",
                currentLabel = "${skrLabel(weeklySkr)} / ${skrLabel(volumeTarget)} SKR",
                progress = (weeklySkr.toFloat() / volumeTarget.toFloat()).coerceIn(0f, 1f),
                isCompleted = weeklySkr >= volumeTarget,
            )

            WeeklyTemplate.HEATWAVE -> {
                val target = (volumeTarget * 1.5).coerceAtLeast(25.0)
                WeeklyQuest(
                    id = "weekly_heatwave",
                    title = "HEATWAVE",
                    description = "Push a high-burn week: ${skrLabel(target)} SKR",
                    currentLabel = "${skrLabel(weeklySkr)} / ${skrLabel(target)} SKR",
                    progress = (weeklySkr.toFloat() / target.toFloat()).coerceIn(0f, 1f),
                    isCompleted = weeklySkr >= target,
                )
            }

            WeeklyTemplate.CONSISTENCY_PLUS -> {
                val targetDays = (daysTarget + 1).coerceAtMost(7)
                WeeklyQuest(
                    id = "weekly_consistency_plus",
                    title = "CONSISTENCY+",
                    description = "Hit $targetDays burn days before Monday reset",
                    currentLabel = "$weeklyDays / $targetDays days",
                    progress = (weeklyDays.toFloat() / targetDays.toFloat()).coerceIn(0f, 1f),
                    isCompleted = weeklyDays >= targetDays,
                )
            }
        }

        return listOf(buildWeekly(first), buildWeekly(second))
    }

    // ── Milestones ───────────────────────────────────────────────────────────

    /** Long-term progression milestones — always derived from backend data. */
    fun milestones(state: HomeUiState): List<Milestone> {
        val streakTarget = SeekerBurnConfig.STREAK_MILESTONES
            .firstOrNull { it > state.currentStreak && "STREAK_$it" !in state.earnedBadgeIds }
            ?: state.currentStreak.coerceAtLeast(1)
        val streakProgress = (state.currentStreak.toFloat() / streakTarget.toFloat()).coerceIn(0f, 1f)

        val lifetimeTarget = SeekerBurnConfig.LIFETIME_MILESTONES
            .firstOrNull { it > state.lifetimeBurned } ?: state.lifetimeBurned.coerceAtLeast(1.0)
        val lifetimeProgress = (state.lifetimeBurned / lifetimeTarget).toFloat().coerceIn(0f, 1f)

        return listOf(
            Milestone(
                title        = "STREAK MILESTONE",
                subtitle     = "${state.currentStreak} / $streakTarget consecutive days",
                currentLabel = "${state.currentStreak} days",
                targetLabel  = "$streakTarget days",
                progress     = streakProgress,
                isCompleted  = state.currentStreak >= streakTarget,
            ),
            Milestone(
                title        = "LIFETIME BURN",
                subtitle     = "${skrLabel(state.lifetimeBurned)} / ${skrLabel(lifetimeTarget)} SKR",
                currentLabel = "${skrLabel(state.lifetimeBurned)} SKR",
                targetLabel  = "${skrLabel(lifetimeTarget)} SKR",
                progress     = lifetimeProgress,
                isCompleted  = state.lifetimeBurned >= lifetimeTarget,
            ),
        )
    }
}
