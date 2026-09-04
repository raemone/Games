/**
 * The shape of everything the app remembers, plus the accessors that make the
 * sparse log readable.
 *
 * Two invariants hold everywhere and are enforced by the reducer and the
 * migration:
 *
 *   - The log is SPARSE. A count of zero is never stored; a day with nobody in
 *     it is deleted. So `Object.keys(log)` is exactly the days something was
 *     picked up, and it sorts chronologically for free.
 *   - Nothing gamified is persisted. No badge list, no cached totals. Badges,
 *     ranks and streaks are derived on every render, which is why backfilling
 *     last Tuesday repairs a streak and grants a badge with no migration.
 */

import { compareDays } from './dates';
import type { DayKey } from './dates';

export type PersonId = string;

export interface Person {
  readonly id: PersonId;
  readonly name: string;
  readonly emoji: string;
  /** Always one of PERSON_COLORS. */
  readonly color: string;
  /** Retired people keep their history but drop off today's list. */
  readonly retired: boolean;
}

/** day -> person -> count, sparse in both directions. */
export type Log = Readonly<Record<DayKey, Readonly<Record<PersonId, number>>>>;

export interface Settings {
  readonly dogName: string;
  /** Family pickups per week the goal bar aims at. */
  readonly weeklyGoal: number;
  readonly soundOn: boolean;
  readonly confettiOn: boolean;
}

export type RewardKind = 'points' | 'days';

/**
 * Something the work buys. The family edits these, so they are stored rather
 * than baked into the code.
 *
 * Flat rather than a discriminated union: `kind` says which of `price` and
 * `streakDays` is meaningful, and the other stays 0. A union reads better in
 * the logic but is painful to edit through a form, and this record is one a
 * parent types into.
 */
export interface Reward {
  readonly id: string;
  readonly emoji: string;
  readonly name: string;
  readonly blurb: string;
  readonly kind: RewardKind;
  /** Points kind: what it costs. */
  readonly price: number;
  /**
   * Days kind: how many days this person has to have picked something up -
   * counted in total, not in a row. A family that travels cannot hold a
   * hundred-day run, but they can absolutely rack up a hundred days.
   * Won once, ever.
   */
  readonly daysNeeded: number;
  /**
   * Removed rewards are archived, never deleted: a claim already made spent
   * real points, and dropping it would hand those points back by accident.
   */
  readonly archived: boolean;
}

/**
 * A reward handed over. This is the one thing that is stored rather than
 * derived: giving somebody a lunch is an event in the world, and no amount of
 * reading the log can tell you whether it happened.
 */
export interface Claim {
  readonly rewardId: string;
  readonly personId: PersonId;
  readonly day: DayKey;
  /** What it actually cost, so re-pricing later never rewrites the past. */
  readonly cost: number;
}

export interface SaveData {
  readonly version: number;
  readonly people: readonly Person[];
  /** Ids come from this counter and are never reused, even after a delete. */
  readonly nextPersonId: number;
  readonly log: Log;
  readonly rewards: readonly Reward[];
  /** Ids come from this counter and are never reused. */
  readonly nextRewardId: number;
  readonly claims: readonly Claim[];
  readonly settings: Settings;
}

export const MAX_PER_DAY = 99;
export const MAX_REWARDS = 20;
export const MAX_REWARD_NAME = 28;
export const MAX_REWARD_BLURB = 60;
export const MAX_PEOPLE = 12;
export const MAX_NAME_LENGTH = 16;
export const MIN_WEEKLY_GOAL = 1;
export const MAX_WEEKLY_GOAL = 500;
export const DEFAULT_WEEKLY_GOAL = 25;
export const DEFAULT_DOG_NAME = 'Roxy';

/**
 * Chosen to stay distinguishable under the common colour-vision deficiencies,
 * not just to look nice together. They sit behind an avatar emoji only - body
 * text never depends on which one somebody picked.
 */
export const PERSON_COLORS: readonly string[] = [
  '#ffd88a',
  '#7ec8f0',
  '#ff9ec4',
  '#8ce0a8',
  '#c9a4ff',
  '#ffab6b',
  '#6fd8d0',
  '#f28b82',
];

export const PERSON_EMOJI: readonly string[] = [
  '🐶',
  '🦊',
  '🐱',
  '🐼',
  '🐨',
  '🦁',
  '🐸',
  '🐵',
  '🦄',
  '🐧',
  '🦖',
  '🐢',
  '⭐',
  '🌈',
  '🚀',
  '⚡',
  '🍕',
  '🍩',
  '🎩',
  '👑',
  '🌻',
  '🔥',
  '💎',
  '🎈',
];

export function firstColor(): string {
  return PERSON_COLORS[0] ?? '#ffd88a';
}

export function firstEmoji(): string {
  return PERSON_EMOJI[0] ?? '🐶';
}

export function defaultSettings(): Settings {
  return {
    dogName: DEFAULT_DOG_NAME,
    weeklyGoal: DEFAULT_WEEKLY_GOAL,
    soundOn: true,
    confettiOn: true,
  };
}

/**
 * The one place the sparse log is read. Everything else goes through this, so
 * `noUncheckedIndexedAccess` never leaks past this file.
 */
export function countFor(log: Log, day: DayKey, personId: PersonId): number {
  return log[day]?.[personId] ?? 0;
}

/** Everyone's pickups on one day. */
export function dayTotal(log: Log, day: DayKey): number {
  const entries = log[day];
  if (!entries) return 0;
  let total = 0;
  for (const count of Object.values(entries)) total += count;
  return total;
}

/** The days this person picked something up, ascending. */
export function activeDaysFor(log: Log, personId: PersonId): readonly DayKey[] {
  const days: DayKey[] = [];
  for (const [day, entries] of Object.entries(log)) {
    if ((entries[personId] ?? 0) > 0) days.push(day);
  }
  // 'YYYY-MM-DD' sorts lexicographically in calendar order, so a plain sort is
  // already chronological.
  return days.sort();
}

export const REWARD_EMOJI: readonly string[] = [
  '📺', '🎮', '🕹️', '📱', '🍗', '🍕', '🍦', '🍪', '🎬', '🎟️',
  '⚽', '🏊', '🚲', '🧸', '📚', '🎨', '💸', '🛌', '🐾', '🎉',
];

export function firstRewardEmoji(): string {
  return REWARD_EMOJI[0] ?? '🎁';
}

/** Days this person picked something up, counted in total rather than in a row. */
export function daysPickedUp(log: Log, personId: PersonId, today: DayKey): number {
  return activeDaysFor(log, personId).filter((day) => compareDays(day, today) <= 0).length;
}

export function personById(people: readonly Person[], id: PersonId): Person | null {
  return people.find((person) => person.id === id) ?? null;
}

export function activePeople(people: readonly Person[]): readonly Person[] {
  return people.filter((person) => !person.retired);
}
