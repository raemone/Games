/**
 * Every locale-aware string in the app is built here, and nowhere else - which
 * is what keeps `src/core` free of `Intl` and its tests free of the runner's
 * locale.
 */

import { parseDayKey, weekDays } from '../core/dates';
import type { DayKey } from '../core/dates';

/** 'M', 'T', 'W' … for the day strip. */
export function weekdayLetter(day: DayKey): string {
  return parseDayKey(day).toLocaleDateString(undefined, { weekday: 'narrow' });
}

/** The day of the month, for the day strip. */
export function dayNumber(day: DayKey): string {
  return String(parseDayKey(day).getDate());
}

/** 'Sat 30 Aug', for the past-day banner. */
export function shortDate(day: DayKey): string {
  return parseDayKey(day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** 'Monday, 31 August', for headings. */
export function longDate(day: DayKey): string {
  return parseDayKey(day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** 'Week of 31 Aug' or, when it straddles a month, '31 Aug - 6 Sep'. */
export function weekLabel(weekStart: DayKey): string {
  const days = weekDays(weekStart);
  const last = days[days.length - 1] ?? weekStart;
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const from = parseDayKey(weekStart).toLocaleDateString(undefined, options);
  const to = parseDayKey(last).toLocaleDateString(undefined, options);
  return `${from} – ${to}`;
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function poopWord(count: number): string {
  return plural(count, 'poop', 'poops');
}

export function points(value: number): string {
  return value.toLocaleString();
}
