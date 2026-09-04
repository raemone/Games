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
  MAX_REWARDS,
  MAX_REWARD_BLURB,
  MAX_REWARD_NAME,
  MAX_PEOPLE,
  MAX_PER_DAY,
  MAX_WEEKLY_GOAL,
  MIN_WEEKLY_GOAL,
  PERSON_COLORS,
  PERSON_EMOJI,
  firstColor,
  firstEmoji,
} from './model';
import type { Claim, Log, Person, PersonId, Reward, RewardKind, SaveData, Settings } from './model';
import {
  MAX_PRICE,
  MAX_DAYS_NEEDED,
  MIN_PRICE,
  MIN_DAYS_NEEDED,
  canClaim,
  costOf,
} from './rewards';

/** What a parent types into the reward form. */
export interface RewardDraft {
  readonly emoji: string;
  readonly name: string;
  readonly blurb: string;
  readonly kind: RewardKind;
  readonly price: number;
  readonly daysNeeded: number;
}

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
  | { readonly kind: 'addReward'; readonly draft: RewardDraft }
  | { readonly kind: 'editReward'; readonly rewardId: string; readonly draft: RewardDraft }
  | { readonly kind: 'archiveReward'; readonly rewardId: string; readonly archived: boolean }
  | { readonly kind: 'claimReward'; readonly rewardId: string; readonly personId: PersonId }
  | { readonly kind: 'unclaimReward'; readonly rewardId: string; readonly personId: PersonId }
  | { readonly kind: 'setSettings'; readonly settings: Settings }
  | { readonly kind: 'replaceAll'; readonly save: SaveData };

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
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

/** Everything a parent typed, clamped into something the app can live with. */
function cleanDraft(draft: RewardDraft, id: string): Reward | null {
  const name = draft.name.trim().slice(0, MAX_REWARD_NAME);
  if (name.length === 0) return null;

  const points = draft.kind === 'points';
  return {
    id,
    emoji: draft.emoji.trim().length > 0 ? draft.emoji.trim() : '🎁',
    name,
    blurb: draft.blurb.trim().slice(0, MAX_REWARD_BLURB),
    kind: draft.kind,
    price: points ? clamp(Math.round(draft.price), MIN_PRICE, MAX_PRICE) : 0,
    daysNeeded: points ? 0 : clamp(Math.round(draft.daysNeeded), MIN_DAYS_NEEDED, MAX_DAYS_NEEDED),
    archived: false,
  };
}

function addReward(save: SaveData, draft: RewardDraft): SaveData {
  if (save.rewards.length >= MAX_REWARDS) return save;

  const reward = cleanDraft(draft, `r${String(save.nextRewardId)}`);
  if (!reward) return save;

  return { ...save, rewards: [...save.rewards, reward], nextRewardId: save.nextRewardId + 1 };
}

function editReward(save: SaveData, rewardId: string, draft: RewardDraft): SaveData {
  const existing = save.rewards.find((reward) => reward.id === rewardId);
  if (!existing) return save;

  const cleaned = cleanDraft(draft, rewardId);
  if (!cleaned) return save;

  // Editing never un-archives; that is what the archive action is for.
  const updated: Reward = { ...cleaned, archived: existing.archived };
  return { ...save, rewards: save.rewards.map((reward) => (reward.id === rewardId ? updated : reward)) };
}

/**
 * Removing a reward archives it rather than deleting it. A claim already made
 * spent real points, and losing the reward it points at would quietly hand
 * those points back.
 */
function archiveReward(save: SaveData, rewardId: string, archived: boolean): SaveData {
  if (!save.rewards.some((reward) => reward.id === rewardId)) return save;
  return {
    ...save,
    rewards: save.rewards.map((reward) => (reward.id === rewardId ? { ...reward, archived } : reward)),
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
    case 'addReward':
      return addReward(save, action.draft);
    case 'editReward':
      return editReward(save, action.rewardId, action.draft);
    case 'archiveReward':
      return archiveReward(save, action.rewardId, action.archived);
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
        },
      };
    case 'replaceAll':
      return action.save;
  }
}
