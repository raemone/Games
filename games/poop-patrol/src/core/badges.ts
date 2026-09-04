/**
 * Badges are pure predicates over the log - nothing is ever stored. That is
 * what lets a backfill grant one retroactively, and it means there is no
 * "unlocked" list to drift out of step with the history.
 *
 * There is deliberately no time-of-day badge: days are backfilled, so any
 * timestamp would be invented.
 */

import { diffDays, startOfWeek, weekdayIndex } from './dates';
import type { DayKey } from './dates';
import { activeDaysFor, countFor } from './model';
import type { PersonId, SaveData } from './model';
import { familyWeekTotal, scoreDay } from './scoring';
import { bestStreak } from './streaks';

const SATURDAY = 5;
const SUNDAY = 6;

interface WeekSummary {
  readonly weekStart: DayKey;
  readonly weekdays: ReadonlySet<number>;
  readonly points: number;
}

/** Everything the predicates need, computed once per person. */
export interface PersonStats {
  readonly careerPoops: number;
  readonly bestDay: number;
  readonly bestStreak: number;
  readonly activeDays: readonly DayKey[];
  readonly mondayCount: number;
  readonly weeks: readonly WeekSummary[];
  readonly hasFullWeek: boolean;
  readonly hasWeekendPair: boolean;
  readonly hasCleanSweepWeek: boolean;
  readonly isPersonalBestWeek: boolean;
  readonly hasComeback: boolean;
}

export interface BadgeContext {
  readonly save: SaveData;
  readonly personId: PersonId;
  readonly today: DayKey;
  readonly stats: PersonStats;
}

export interface BadgeDef {
  readonly id: string;
  readonly emoji: string;
  readonly name: string;
  /** One line a child can read. */
  readonly blurb: string;
  readonly earned: (ctx: BadgeContext) => boolean;
}

/** Runs of consecutive active days, in order. */
function runsOf(days: readonly DayKey[]): readonly (readonly DayKey[])[] {
  const runs: DayKey[][] = [];
  let current: DayKey[] = [];

  for (const day of days) {
    const previous = current[current.length - 1];
    if (previous !== undefined && diffDays(previous, day) === 1) {
      current.push(day);
      continue;
    }
    if (current.length > 0) runs.push(current);
    current = [day];
  }
  if (current.length > 0) runs.push(current);

  return runs;
}

/** A 3+ day run that began after a week or more away. */
function hasComeback(days: readonly DayKey[]): boolean {
  const runs = runsOf(days);
  for (let index = 1; index < runs.length; index += 1) {
    const run = runs[index];
    const previous = runs[index - 1];
    const start = run?.[0];
    const previousEnd = previous?.[previous.length - 1];
    if (!run || start === undefined || previousEnd === undefined) continue;
    if (run.length >= 3 && diffDays(previousEnd, start) >= 8) return true;
  }
  return false;
}

export function personStats(save: SaveData, personId: PersonId, today: DayKey): PersonStats {
  const activeDays = activeDaysFor(save.log, personId).filter((day) => diffDays(day, today) >= 0);

  let bestDay = 0;
  let poops = 0;
  let mondayCount = 0;
  const byWeek = new Map<DayKey, { weekdays: Set<number>; points: number }>();

  for (const day of activeDays) {
    const count = countFor(save.log, day, personId);
    bestDay = Math.max(bestDay, count);
    poops += count;
    const index = weekdayIndex(day);
    if (index === 0) mondayCount += 1;

    const weekStart = startOfWeek(day);
    const summary = byWeek.get(weekStart) ?? { weekdays: new Set<number>(), points: 0 };
    summary.weekdays.add(index);
    summary.points += scoreDay(save.log, personId, day).points;
    byWeek.set(weekStart, summary);
  }

  const weeks: WeekSummary[] = [...byWeek.entries()]
    .map(([weekStart, summary]) => ({ weekStart, weekdays: summary.weekdays, points: summary.points }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart, 'en'));

  const thisWeek = startOfWeek(today);
  const thisWeekPoints = byWeek.get(thisWeek)?.points ?? 0;
  const bestOtherWeek = weeks
    .filter((week) => week.weekStart !== thisWeek)
    .reduce((best, week) => Math.max(best, week.points), 0);

  return {
    careerPoops: poops,
    bestDay,
    bestStreak: bestStreak(save.log, personId, today),
    activeDays,
    mondayCount,
    weeks,
    hasFullWeek: weeks.some((week) => week.weekdays.size === 7),
    hasWeekendPair: weeks.some((week) => week.weekdays.has(SATURDAY) && week.weekdays.has(SUNDAY)),
    hasCleanSweepWeek: weeks.some(
      (week) => familyWeekTotal(save.log, week.weekStart) >= save.settings.weeklyGoal,
    ),
    isPersonalBestWeek: weeks.length >= 2 && thisWeekPoints > bestOtherWeek,
    hasComeback: hasComeback(activeDays),
  };
}

export const BADGES: readonly BadgeDef[] = [
  {
    id: 'first-flush',
    emoji: '🎉',
    name: 'First Flush',
    blurb: "You're on the patrol!",
    earned: ({ stats }) => stats.careerPoops >= 1,
  },
  {
    id: 'double-doody',
    emoji: '✌️',
    name: 'Double Doody',
    blurb: 'Two in one day.',
    earned: ({ stats }) => stats.bestDay >= 2,
  },
  {
    id: 'hat-trick',
    emoji: '🎩',
    name: 'Hat Trick',
    blurb: 'Three in one day. Fancy.',
    earned: ({ stats }) => stats.bestDay >= 3,
  },
  {
    id: 'scoop-troop',
    emoji: '🧹',
    name: 'Scoop Troop',
    blurb: 'Five in a single day.',
    earned: ({ stats }) => stats.bestDay >= 5,
  },
  {
    id: 'mount-poopmore',
    emoji: '🏔️',
    name: 'Mount Poopmore',
    blurb: 'Ten in one day. A monument.',
    earned: ({ stats }) => stats.bestDay >= 10,
  },
  {
    id: 'two-in-a-row',
    emoji: '🔥',
    name: 'Two in a Row',
    blurb: 'Back-to-back days.',
    earned: ({ stats }) => stats.bestStreak >= 2,
  },
  {
    id: 'week-warrior',
    emoji: '🗓️',
    name: 'Week Warrior',
    blurb: 'Seven days straight.',
    earned: ({ stats }) => stats.bestStreak >= 7,
  },
  {
    id: 'fortnight-flinger',
    emoji: '💪',
    name: 'Fortnight Flinger',
    blurb: 'Fourteen days. Arms of steel.',
    earned: ({ stats }) => stats.bestStreak >= 14,
  },
  {
    id: 'monthly-marvel',
    emoji: '🌙',
    name: 'Monthly Marvel',
    blurb: 'Thirty days in a row.',
    earned: ({ stats }) => stats.bestStreak >= 30,
  },
  {
    id: 'steady-scooper',
    emoji: '🧭',
    name: 'Steady Scooper',
    blurb: 'Every single day of a week.',
    earned: ({ stats }) => stats.hasFullWeek,
  },
  {
    id: 'monday-motivator',
    emoji: '🌅',
    name: 'Monday Motivator',
    blurb: 'You start the week right.',
    earned: ({ stats }) => stats.mondayCount >= 4,
  },
  {
    id: 'weekend-warrior',
    emoji: '🏖️',
    name: 'Weekend Warrior',
    blurb: 'Weekends count too.',
    earned: ({ stats }) => stats.hasWeekendPair,
  },
  {
    id: 'rain-or-shine',
    emoji: '☔',
    name: 'Rain or Shine',
    blurb: 'Three weeks on patrol.',
    earned: ({ stats }) => stats.weeks.length >= 3,
  },
  {
    id: 'century-club',
    emoji: '💯',
    name: 'Century Club',
    blurb: 'One hundred. Wow.',
    earned: ({ stats }) => stats.careerPoops >= 100,
  },
  {
    id: 'double-century',
    emoji: '🏆',
    name: 'Double Century',
    blurb: 'Two hundred!',
    earned: ({ stats }) => stats.careerPoops >= 200,
  },
  {
    id: 'clean-sweep',
    emoji: '✨',
    name: 'Clean Sweep',
    blurb: 'The whole team hit the goal.',
    earned: ({ stats }) => stats.hasCleanSweepWeek,
  },
  {
    id: 'personal-best',
    emoji: '📈',
    name: 'Personal Best',
    blurb: 'Your best week yet.',
    earned: ({ stats }) => stats.isPersonalBestWeek,
  },
  {
    id: 'comeback-kid',
    emoji: '🔄',
    name: 'Comeback Kid',
    blurb: 'Right back at it.',
    earned: ({ stats }) => stats.hasComeback,
  },
];

export function badgeById(id: string): BadgeDef | null {
  return BADGES.find((badge) => badge.id === id) ?? null;
}

export function earnedBadgeIds(save: SaveData, personId: PersonId, today: DayKey): ReadonlySet<string> {
  const ctx: BadgeContext = { save, personId, today, stats: personStats(save, personId, today) };
  const earned = new Set<string>();
  for (const badge of BADGES) {
    if (badge.earned(ctx)) earned.add(badge.id);
  }
  return earned;
}

/** What just landed, in BADGES order, so a celebration can queue them. */
export function newlyEarned(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): readonly BadgeDef[] {
  return BADGES.filter((badge) => after.has(badge.id) && !before.has(badge.id));
}
