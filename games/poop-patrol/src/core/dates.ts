/**
 * Calendar days, as local dates.
 *
 * Local time is read in exactly one place: `dayKey(date)`. Everything after
 * that is integer arithmetic on the key. No other function in the codebase may
 * construct a Date in order to compute a day.
 *
 * Two things are banned outright, because both file a Saturday evening pickup
 * on Sunday:
 *
 *   - `toISOString()`. At 20:00 on 4 Sep in New York it returns '2026-09-05'.
 *   - Adding 86_400_000ms. Spring-forward days are 23 hours long, so "+24h"
 *     can land on the same date twice or skip one entirely.
 *
 * `epochDay` converts a key to a day number through `Date.UTC`, which ignores
 * the local zone completely: leap years and month lengths come from the
 * platform, and DST cannot participate because UTC has none.
 */

/** A local calendar date as 'YYYY-MM-DD'. Sorts lexicographically = chronologically. */
export type DayKey = string;

const MS_PER_DAY = 86_400_000;
const KEY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** The local calendar date `date` falls on, from its local components. */
export function dayKey(date: Date): DayKey {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/**
 * A Date at local NOON on that day, for formatting only - never for arithmetic.
 *
 * Noon rather than midnight because midnight does not exist on some
 * spring-forward days, and a midnight Date in a negative-offset zone can
 * format as the previous day. Noon is 11+ hours from either boundary.
 */
export function parseDayKey(key: DayKey): Date {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/**
 * Validates the calendar, not just the shape: the round-trip rejects
 * '2026-02-30', which the regex alone accepts and which would otherwise sit in
 * the log forever poisoning every scan.
 */
export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string' || !KEY_SHAPE.test(value)) return false;
  return dayKey(parseDayKey(value)) === value;
}

/** Days since 1970-01-01, computed in UTC so DST cannot reach it. */
export function epochDay(key: DayKey): number {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromEpochDay(day: number): DayKey {
  const date = new Date(day * MS_PER_DAY);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

export function addDays(key: DayKey, delta: number): DayKey {
  return fromEpochDay(epochDay(key) + delta);
}

/** Signed whole days from `from` to `to`. */
export function diffDays(from: DayKey, to: DayKey): number {
  return epochDay(to) - epochDay(from);
}

export function compareDays(a: DayKey, b: DayKey): number {
  return epochDay(a) - epochDay(b);
}

/** `count` keys ending at `end`, ascending. */
export function lastNDays(end: DayKey, count: number): readonly DayKey[] {
  if (count <= 0) return [];
  const last = epochDay(end);
  const days: DayKey[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    days.push(fromEpochDay(last - offset));
  }
  return days;
}

/**
 * 0 = Monday … 6 = Sunday.
 *
 * Derived from the epoch day rather than `Date.getDay()` so it stays in the
 * same integer world as the rest of the module. Epoch day 0 was a Thursday,
 * hence the +3; the extra `+ 7) % 7` guards keys before 1970.
 */
export function weekdayIndex(key: DayKey): number {
  return (((epochDay(key) + 3) % 7) + 7) % 7;
}

/** The Monday on or before `key`. */
export function startOfWeek(key: DayKey): DayKey {
  return addDays(key, -weekdayIndex(key));
}

/** The seven keys of that week, Monday first. */
export function weekDays(weekStart: DayKey): readonly DayKey[] {
  const start = epochDay(weekStart);
  const days: DayKey[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    days.push(fromEpochDay(start + offset));
  }
  return days;
}
