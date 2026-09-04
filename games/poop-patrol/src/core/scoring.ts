/**
 * Points, so an eight-year-old can check the arithmetic:
 *
 *   every pickup is 10 points, and coming back two days running adds a bonus
 *   that grows by 5 a day up to +25.
 *
 * The bonus is flat, never a multiplier. Multipliers compound, which lets
 * whoever started first become mathematically uncatchable inside a week - the
 * exact thing that makes a younger player stop trying.
 */

import { weekDays } from './dates';
import type { DayKey } from './dates';
import { activeDaysFor, countFor, dayTotal } from './model';
import type { Log, PersonId } from './model';
import { streakLengthOn } from './streaks';

export const POINTS_PER_POOP = 10;
export const BONUS_STEP = 5;
export const MAX_BONUS_STEPS = 5;

export interface DayScore {
  readonly personId: PersonId;
  readonly count: number;
  /** The streak length as it stood ON that day, not today. */
  readonly streakDay: number;
  readonly basePoints: number;
  readonly bonusPoints: number;
  readonly points: number;
}

export interface GoalProgress {
  readonly picked: number;
  readonly goal: number;
  /** Clamped to [0, 1], so a bar can use it directly. */
  readonly fraction: number;
  readonly met: boolean;
}

/** 0, +5, +10, +15, +20, +25, +25, … for streak days 1, 2, 3, … */
export function streakBonus(streakDay: number): number {
  if (streakDay < 2) return 0;
  return Math.min(streakDay - 1, MAX_BONUS_STEPS) * BONUS_STEP;
}

export function dayPoints(count: number, streakDay: number): number {
  if (count <= 0) return 0;
  return count * POINTS_PER_POOP + streakBonus(streakDay);
}

/**
 * The single owner of "what is this day worth". It uses the streak as it stood
 * on that day, so logging Thursday never changes what Tuesday was worth and
 * last week's leaderboard stays stable.
 */
export function scoreDay(log: Log, personId: PersonId, day: DayKey): DayScore {
  const count = countFor(log, day, personId);
  const streakDay = count > 0 ? streakLengthOn(log, personId, day) : 0;
  const basePoints = count * POINTS_PER_POOP;
  const bonusPoints = count > 0 ? streakBonus(streakDay) : 0;

  return {
    personId,
    count,
    streakDay,
    basePoints,
    bonusPoints,
    points: basePoints + bonusPoints,
  };
}

export function careerPoints(log: Log, personId: PersonId): number {
  let total = 0;
  for (const day of activeDaysFor(log, personId)) {
    total += scoreDay(log, personId, day).points;
  }
  return total;
}

export function careerPoops(log: Log, personId: PersonId): number {
  let total = 0;
  for (const day of activeDaysFor(log, personId)) {
    total += countFor(log, day, personId);
  }
  return total;
}

/** Everyone's pickups across one Monday-to-Sunday week. */
export function familyWeekTotal(log: Log, weekStart: DayKey): number {
  let total = 0;
  for (const day of weekDays(weekStart)) total += dayTotal(log, day);
  return total;
}

export function familyGoalProgress(log: Log, weekStart: DayKey, goal: number): GoalProgress {
  const picked = familyWeekTotal(log, weekStart);
  const safeGoal = Math.max(1, Math.round(goal));

  return {
    picked,
    goal: safeGoal,
    fraction: Math.min(1, picked / safeGoal),
    met: picked >= safeGoal,
  };
}
