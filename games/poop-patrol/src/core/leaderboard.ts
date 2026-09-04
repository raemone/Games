/**
 * The weekly board, Monday to Sunday.
 *
 * Ranking is competition-style, so a genuine tie SHARES a rank (1, 2, 2, 4)
 * and both rows get the same medal. Two kids who did identical work must see
 * identical results, or the whole thing stops being fun.
 *
 * There is no last place and no red: everyone above zero gets a star.
 */

import { weekDays } from './dates';
import type { DayKey } from './dates';
import { countFor } from './model';
import type { Person, SaveData } from './model';
import { scoreDay } from './scoring';

export interface LeaderRow {
  readonly person: Person;
  readonly poops: number;
  readonly points: number;
  readonly daysActive: number;
  readonly bestDay: number;
  /** Seven entries, Monday first, for the dot strip. */
  readonly days: readonly boolean[];
  /** Competition rank: 1, 2, 2, 4. */
  readonly rank: number;
  readonly tied: boolean;
}

type RowStats = Omit<LeaderRow, 'rank' | 'tied'>;

/**
 * Points first, then pickups (the streak bonus decouples the two), then days
 * turned up - so a week of showing up beats one heroic Saturday.
 */
export function compareForRank(a: RowStats, b: RowStats): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.poops !== b.poops) return b.poops - a.poops;
  return b.daysActive - a.daysActive;
}

/** Ranking order, then person id purely to make the array deterministic. */
export function compareForOrder(a: RowStats, b: RowStats): number {
  const byRank = compareForRank(a, b);
  if (byRank !== 0) return byRank;
  return a.person.id.localeCompare(b.person.id, 'en');
}

export function medalFor(rank: number, points: number): string {
  if (points <= 0) return '';
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '🌟';
}

function statsFor(save: SaveData, person: Person, days: readonly DayKey[]): RowStats {
  let poops = 0;
  let points = 0;
  let daysActive = 0;
  let bestDay = 0;
  const dayFlags: boolean[] = [];

  for (const day of days) {
    const count = countFor(save.log, day, person.id);
    dayFlags.push(count > 0);
    if (count <= 0) continue;

    poops += count;
    points += scoreDay(save.log, person.id, day).points;
    daysActive += 1;
    bestDay = Math.max(bestDay, count);
  }

  return { person, poops, points, daysActive, bestDay, days: dayFlags };
}

/**
 * Everyone currently on the patrol, plus anyone retired who actually scored
 * that week - so a past week still reads correctly without a retired person
 * haunting the current one.
 */
export function weekBoard(save: SaveData, weekStart: DayKey): readonly LeaderRow[] {
  const days = weekDays(weekStart);

  const stats = save.people
    .map((person) => statsFor(save, person, days))
    .filter((row) => !row.person.retired || row.points > 0)
    .sort(compareForOrder);

  const rows: LeaderRow[] = [];
  for (let index = 0; index < stats.length; index += 1) {
    const row = stats[index];
    if (!row) continue;

    const previous = stats[index - 1];
    const sharesWithPrevious = previous !== undefined && compareForRank(previous, row) === 0;
    // Competition ranking: a tie keeps the earlier rank, the next distinct row
    // skips ahead to its position in the list.
    const rank = sharesWithPrevious ? (rows[index - 1]?.rank ?? index + 1) : index + 1;

    const next = stats[index + 1];
    const sharesWithNext = next !== undefined && compareForRank(row, next) === 0;

    rows.push({ ...row, rank, tied: sharesWithPrevious || sharesWithNext });
  }

  return rows;
}
