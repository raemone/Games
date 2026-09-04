/**
 * Every change to the save goes through `reduce`. It is pure: it never mutates
 * its input and never reads the clock - `today` is passed in, so a test can
 * pretend it is any day it likes.
 *
 * The sparse-log invariant is enforced here and nowhere else: a count of zero
 * removes the person's key, and the last person leaving a day removes the day.
 */

import { compareDays } from './dates';
import type { DayKey } from './dates';
import {
  MAX_NAME_LENGTH,
  MAX_PEOPLE,
  MAX_PER_DAY,
  MAX_WEEKLY_GOAL,
  MIN_WEEKLY_GOAL,
  PERSON_COLORS,
  PERSON_EMOJI,
  firstColor,
  firstEmoji,
} from './model';
import type { Claim, Log, Person, PersonId, SaveData, Settings } from './model';
import { MAX_PRICE, MIN_PRICE, canClaim, costOf } from './rewards';

export type Action =
  | { readonly kind: 'adjustCount'; readonly day: DayKey; readonly personId: PersonId; readonly delta: number }
  | { readonly kind: 'setCount'; readonly day: DayKey; readonly personId: PersonId; readonly count: number }
  | { readonly kind: 'addPerson'; readonly name: string; readonly emoji: string; readonly color: string }
  | {
      readonly kind: 'editPerson';
      readonly personId: PersonId;
      readonly name: string;
      readonly emoji: string;
      readonly color: string;
    }
  | { readonly kind: 'retirePerson'; readonly personId: PersonId; readonly retired: boolean }
  | { readonly kind: 'deletePerson'; readonly personId: PersonId }
  | { readonly kind: 'claimReward'; readonly rewardId: string; readonly personId: PersonId }
  | { readonly kind: 'unclaimReward'; readonly rewardId: string; readonly personId: PersonId }
  | { readonly kind: 'setSettings'; readonly settings: Settings }
  | { readonly kind: 'replaceAll'; readonly save: SaveData };

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Prices are typed by a parent, so every one of them is clamped. */
function cleanPrices(prices: Readonly<Record<string, number>>): Record<string, number> {
  const cleaned: Record<string, number> = {};
  for (const [id, value] of Object.entries(prices)) {
    if (!Number.isFinite(value)) continue;
    cleaned[id] = clamp(Math.round(value), MIN_PRICE, MAX_PRICE);
  }
  return cleaned;
}

function cleanName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

/** Writes a count into the log, keeping it sparse. */
function withCount(log: Log, day: DayKey, personId: PersonId, count: number): Log {
  const existing = log[day] ?? {};
  if (count <= 0) {
    if (!(personId in existing)) return log;

    const { [personId]: _removed, ...rest } = existing;
    if (Object.keys(rest).length === 0) {
      const { [day]: _emptyDay, ...others } = log;
      return others;
    }
    return { ...log, [day]: rest };
  }

  return { ...log, [day]: { ...existing, [personId]: count } };
}

function setCount(save: SaveData, day: DayKey, personId: PersonId, count: number, today: DayKey): SaveData {
  // A future day cannot be logged - a tablet with a fast clock must not be
  // able to manufacture a streak.
  if (compareDays(day, today) > 0) return save;
  if (!save.people.some((person) => person.id === personId)) return save;

  const wanted = clamp(Math.floor(count), 0, MAX_PER_DAY);
  const log = withCount(save.log, day, personId, wanted);
  return log === save.log ? save : { ...save, log };
}

function addPerson(save: SaveData, name: string, emoji: string, color: string): SaveData {
  if (save.people.length >= MAX_PEOPLE) return save;

  const trimmed = cleanName(name);
  if (trimmed.length === 0) return save;

  const person: Person = {
    id: `p${save.nextPersonId}`,
    name: trimmed,
    emoji: PERSON_EMOJI.includes(emoji) ? emoji : firstEmoji(),
    color: PERSON_COLORS.includes(color) ? color : firstColor(),
    retired: false,
  };

  return { ...save, people: [...save.people, person], nextPersonId: save.nextPersonId + 1 };
}

function editPerson(
  save: SaveData,
  personId: PersonId,
  name: string,
  emoji: string,
  color: string,
): SaveData {
  const trimmed = cleanName(name);
  if (trimmed.length === 0) return save;
  if (!save.people.some((person) => person.id === personId)) return save;

  return {
    ...save,
    people: save.people.map((person) =>
      person.id === personId
        ? {
            ...person,
            name: trimmed,
            emoji: PERSON_EMOJI.includes(emoji) ? emoji : person.emoji,
            color: PERSON_COLORS.includes(color) ? color : person.color,
          }
        : person,
    ),
  };
}

/** Soft removal: they drop off today's list but every past total stays honest. */
function retirePerson(save: SaveData, personId: PersonId, retired: boolean): SaveData {
  if (!save.people.some((person) => person.id === personId)) return save;
  return {
    ...save,
    people: save.people.map((person) => (person.id === personId ? { ...person, retired } : person)),
  };
}

/** Hard removal: the person and all of their history. The UI confirms first. */
function deletePerson(save: SaveData, personId: PersonId): SaveData {
  if (!save.people.some((person) => person.id === personId)) return save;

  const log: Record<DayKey, Record<PersonId, number>> = {};
  for (const [day, entries] of Object.entries(save.log)) {
    const { [personId]: _removed, ...rest } = entries;
    if (Object.keys(rest).length > 0) log[day] = rest;
  }

  return {
    ...save,
    // The id is not reused: nextPersonId only ever goes up.
    people: save.people.filter((person) => person.id !== personId),
    log,
    claims: save.claims.filter((claim) => claim.personId !== personId),
  };
}

/** Hand a reward over. Refused unless it is claimable today. */
function claimReward(save: SaveData, personId: PersonId, rewardId: string, today: DayKey): SaveData {
  if (!canClaim(save, personId, today, rewardId)) return save;

  const claim: Claim = { rewardId, personId, day: today, cost: costOf(save, rewardId) };
  return { ...save, claims: [...save.claims, claim] };
}

/**
 * Take back the most recent claim of that reward, for a mis-tap. Without this
 * a stray finger costs somebody a Chick-fil-A lunch until Monday.
 */
function unclaimReward(save: SaveData, personId: PersonId, rewardId: string): SaveData {
  let lastIndex = -1;
  save.claims.forEach((claim, index) => {
    if (claim.personId === personId && claim.rewardId === rewardId) lastIndex = index;
  });
  if (lastIndex < 0) return save;

  return { ...save, claims: save.claims.filter((_claim, index) => index !== lastIndex) };
}

export function reduce(save: SaveData, action: Action, today: DayKey): SaveData {
  switch (action.kind) {
    case 'adjustCount': {
      const current = save.log[action.day]?.[action.personId] ?? 0;
      return setCount(save, action.day, action.personId, current + action.delta, today);
    }
    case 'setCount':
      return setCount(save, action.day, action.personId, action.count, today);
    case 'addPerson':
      return addPerson(save, action.name, action.emoji, action.color);
    case 'editPerson':
      return editPerson(save, action.personId, action.name, action.emoji, action.color);
    case 'retirePerson':
      return retirePerson(save, action.personId, action.retired);
    case 'deletePerson':
      return deletePerson(save, action.personId);
    case 'claimReward':
      return claimReward(save, action.personId, action.rewardId, today);
    case 'unclaimReward':
      return unclaimReward(save, action.personId, action.rewardId);
    case 'setSettings':
      return {
        ...save,
        settings: {
          ...action.settings,
          dogName: cleanName(action.settings.dogName) || save.settings.dogName,
          weeklyGoal: clamp(Math.round(action.settings.weeklyGoal), MIN_WEEKLY_GOAL, MAX_WEEKLY_GOAL),
          rewardPrices: cleanPrices(action.settings.rewardPrices),
        },
      };
    case 'replaceAll':
      return action.save;
  }
}
