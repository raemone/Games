/**
 * A streak is a run of consecutive calendar days on which somebody picked
 * something up.
 *
 * The rule that matters: a streak is ALIVE when the last logged day is today
 * or yesterday. Today with nothing logged yet does not break it - it is
 * 'atRisk', so the UI can say "still alive, log one today" instead of either
 * lying about it or punishing somebody at 07:00 for a day they have not had a
 * chance to defend.
 *
 * Nothing here is stored. Backfilling yesterday rejoins two runs into one with
 * no special case, because the streak is recomputed from the log every time.
 */

import { addDays, compareDays, diffDays } from './dates';
import type { DayKey } from './dates';
import { activeDaysFor } from './model';
import type { Log, PersonId } from './model';

export type StreakStatus = 'none' | 'atRisk' | 'active';

export interface Streak {
  readonly length: number;
  readonly status: StreakStatus;
  readonly best: number;
  readonly lastDay: DayKey | null;
}

/** Active days up to and including `today`; anything later is clock skew. */
function daysUpTo(log: Log, personId: PersonId, today: DayKey): readonly DayKey[] {
  return activeDaysFor(log, personId).filter((day) => compareDays(day, today) <= 0);
}

/** The length of the run of active days ending exactly at `day`, or 0. */
export function streakLengthOn(log: Log, personId: PersonId, day: DayKey): number {
  if ((log[day]?.[personId] ?? 0) <= 0) return 0;

  let length = 1;
  let cursor = addDays(day, -1);
  while ((log[cursor]?.[personId] ?? 0) > 0) {
    length += 1;
    cursor = addDays(cursor, -1);
  }
  return length;
}

/** The longest run this person has ever had, up to and including `today`. */
export function bestStreak(log: Log, personId: PersonId, today: DayKey): number {
  const days = daysUpTo(log, personId, today);

  let best = 0;
  let run = 0;
  let previous: DayKey | null = null;

  for (const day of days) {
    run = previous !== null && diffDays(previous, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  return best;
}

export function streakFor(log: Log, personId: PersonId, today: DayKey): Streak {
  const days = daysUpTo(log, personId, today);
  const last = days[days.length - 1];

  if (last === undefined) {
    return { length: 0, status: 'none', best: 0, lastDay: null };
  }

  const best = bestStreak(log, personId, today);
  const gap = diffDays(last, today);

  // Two or more days since the last pickup: the run is over.
  if (gap > 1) {
    return { length: 0, status: 'none', best, lastDay: last };
  }

  return {
    length: streakLengthOn(log, personId, last),
    status: gap === 0 ? 'active' : 'atRisk',
    best,
    lastDay: last,
  };
}
