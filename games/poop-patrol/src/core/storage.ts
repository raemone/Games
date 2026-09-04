/**
 * The family's history lives in localStorage on this one device and nowhere
 * else - there is no server and no account.
 *
 * Every entry point here is total: a corrupt, absent or older save must
 * produce a usable app rather than an exception. Losing a streak is annoying;
 * a white screen on the kitchen tablet means the chore never gets logged.
 *
 * `migrate` is deliberately paranoid, because this store holds the only copy
 * of the data. It drops what it cannot understand rather than trusting it -
 * in particular a log entry pointing at a person who no longer exists, which
 * would otherwise crash the leaderboard on every render.
 */

import { isDayKey } from './dates';
import {
  DEFAULT_DOG_NAME,
  MAX_REWARDS,
  MAX_REWARD_BLURB,
  MAX_REWARD_NAME,
  DEFAULT_WEEKLY_GOAL,
  MAX_NAME_LENGTH,
  MAX_PEOPLE,
  MAX_PER_DAY,
  MAX_WEEKLY_GOAL,
  MIN_WEEKLY_GOAL,
  PERSON_COLORS,
  PERSON_EMOJI,
  defaultSettings,
  firstColor,
  firstEmoji,
} from './model';
import type { Claim, Log, Person, PersonId, Reward, RewardKind, SaveData, Settings } from './model';
import {
  DEFAULT_REWARDS,
  MAX_PRICE,
  MAX_DAYS_NEEDED,
  MIN_PRICE,
  MIN_DAYS_NEEDED,
} from './rewards';

const KEY = 'poop-patrol:save';
export const SAVE_VERSION = 2;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    people: [],
    nextPersonId: 1,
    log: {},
    rewards: DEFAULT_REWARDS.map((reward) => ({ ...reward })),
    nextRewardId: 1,
    claims: [],
    settings: defaultSettings(),
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function text(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : fallback;
}

function migratePeople(raw: unknown): { people: Person[]; nextPersonId: number } {
  if (!Array.isArray(raw)) return { people: [], nextPersonId: 1 };

  const people: Person[] = [];
  const seen = new Set<PersonId>();
  let highestNumberedId = 0;

  for (const entry of raw) {
    if (people.length >= MAX_PEOPLE) break;
    if (typeof entry !== 'object' || entry === null) continue;

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);

    // Ids are 'p<n>'; anything else is tolerated but does not move the counter.
    const numbered = /^p(\d+)$/.exec(id);
    if (numbered?.[1]) highestNumberedId = Math.max(highestNumberedId, Number(numbered[1]));

    const emoji = typeof record.emoji === 'string' ? record.emoji : '';
    const color = typeof record.color === 'string' ? record.color : '';

    people.push({
      id,
      name: text(record.name, 'Someone', MAX_NAME_LENGTH),
      emoji: PERSON_EMOJI.includes(emoji) ? emoji : firstEmoji(),
      color: PERSON_COLORS.includes(color) ? color : firstColor(),
      retired: bool(record.retired, false),
    });
  }

  return { people, nextPersonId: highestNumberedId + 1 };
}

function migrateLog(raw: unknown, knownIds: ReadonlySet<PersonId>): Log {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const log: Record<string, Record<PersonId, number>> = {};

  for (const [day, entries] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDayKey(day)) continue;
    if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) continue;

    const counts: Record<PersonId, number> = {};
    for (const [personId, value] of Object.entries(entries as Record<string, unknown>)) {
      // A dangling id would break every lookup that assumes the person exists.
      if (!knownIds.has(personId)) continue;
      const count = Math.floor(num(value, 0));
      if (count <= 0) continue;
      counts[personId] = Math.min(count, MAX_PER_DAY);
    }

    if (Object.keys(counts).length > 0) log[day] = counts;
  }

  return log;
}

/**
 * Claims naming a person or a reward that no longer exists are dropped, the
 * same way dangling log entries are - a claim nothing can resolve would break
 * every lookup that assumes the pair is real.
 */
function migrateClaims(raw: unknown, knownIds: ReadonlySet<PersonId>): readonly Claim[] {
  if (!Array.isArray(raw)) return [];

  const claims: Claim[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;

    const personId = typeof record.personId === 'string' ? record.personId : '';
    const rewardId = typeof record.rewardId === 'string' ? record.rewardId : '';
    const day = record.day;

    // The reward id is deliberately NOT checked against the current list: a
    // claim spent real points, and dropping it because the reward was later
    // removed would hand those points back by accident.
    if (!knownIds.has(personId) || rewardId.length === 0 || !isDayKey(day)) continue;

    // One claim per person, reward and day; a duplicate is a double-tap.
    const key = `${personId}|${rewardId}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // A cost that cannot be read is treated as free rather than dropped: losing
    // the record of a lunch is worse than mis-stating what it cost.
    claims.push({ personId, rewardId, day, cost: Math.max(0, Math.floor(num(record.cost, 0))) });
  }

  return claims;
}

/**
 * A save from before the family could edit rewards has no list of its own, so
 * it is seeded with the defaults - and any price it had overridden under the
 * old `settings.rewardPrices` is carried across, so nobody's tuning is lost.
 */
function seedRewards(legacyPrices: unknown): Reward[] {
  const overrides =
    typeof legacyPrices === 'object' && legacyPrices !== null && !Array.isArray(legacyPrices)
      ? (legacyPrices as Record<string, unknown>)
      : {};

  return DEFAULT_REWARDS.map((reward) => {
    const stored = overrides[reward.id];
    if (reward.kind !== 'points' || typeof stored !== 'number' || !Number.isFinite(stored)) {
      return { ...reward };
    }
    return { ...reward, price: clamp(Math.round(stored), MIN_PRICE, MAX_PRICE) };
  });
}

function migrateRewards(raw: unknown, legacyPrices: unknown): Reward[] {
  if (!Array.isArray(raw)) return seedRewards(legacyPrices);

  const rewards: Reward[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (rewards.length >= MAX_REWARDS) break;
    if (typeof entry !== 'object' || entry === null) continue;

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);

    // 'streak' is the old name for this kind, from before the gate counted
    // total days rather than consecutive ones.
    const kind: RewardKind = record.kind === 'days' || record.kind === 'streak' ? 'days' : 'points';

    rewards.push({
      id,
      emoji: typeof record.emoji === 'string' && record.emoji.length > 0 ? record.emoji : '🎁',
      name: text(record.name, 'A reward', MAX_REWARD_NAME),
      blurb: typeof record.blurb === 'string' ? record.blurb.trim().slice(0, MAX_REWARD_BLURB) : '',
      kind,
      price: kind === 'points' ? clamp(Math.round(num(record.price, 100)), MIN_PRICE, MAX_PRICE) : 0,
      daysNeeded:
        kind === 'days'
          ? clamp(
              // Older saves called it streakDays.
              Math.round(num(record.daysNeeded, num(record.streakDays, 100))),
              MIN_DAYS_NEEDED,
              MAX_DAYS_NEEDED,
            )
          : 0,
      archived: bool(record.archived, false),
    });
  }

  // An empty or unreadable list would leave the family with no shop at all.
  return rewards.length > 0 ? rewards : seedRewards(legacyPrices);
}

function migrateSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return base;

  const record = raw as Record<string, unknown>;
  return {
    dogName: text(record.dogName, DEFAULT_DOG_NAME, MAX_NAME_LENGTH),
    weeklyGoal: clamp(
      Math.round(num(record.weeklyGoal, DEFAULT_WEEKLY_GOAL)),
      MIN_WEEKLY_GOAL,
      MAX_WEEKLY_GOAL,
    ),
    soundOn: bool(record.soundOn, base.soundOn),
    confettiOn: bool(record.confettiOn, base.confettiOn),
  };
}

/**
 * Coerce whatever came out of storage into a valid SaveData. Unknown fields
 * are dropped and missing ones defaulted, so an older save upgrades in place
 * instead of being thrown away.
 */
export function migrate(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return defaultSave();

  const input = raw as Record<string, unknown>;
  const { people, nextPersonId } = migratePeople(input.people);
  const knownIds = new Set(people.map((person) => person.id));

  const settings = migrateSettings(input.settings);
  const legacyPrices =
    typeof input.settings === 'object' && input.settings !== null
      ? (input.settings as Record<string, unknown>).rewardPrices
      : undefined;
  const rewards = migrateRewards(input.rewards, legacyPrices);

  // Custom ids look like 'r<n>'; repair a counter that would reuse one.
  let highestRewardId = 0;
  for (const reward of rewards) {
    const numbered = /^r(\d+)$/.exec(reward.id);
    if (numbered?.[1]) highestRewardId = Math.max(highestRewardId, Number(numbered[1]));
  }

  return {
    version: SAVE_VERSION,
    people,
    // Repair a counter that would hand out an id already in use.
    nextPersonId: Math.max(nextPersonId, Math.floor(num(input.nextPersonId, 1)), 1),
    log: migrateLog(input.log, knownIds),
    rewards,
    nextRewardId: Math.max(highestRewardId + 1, Math.floor(num(input.nextRewardId, 1)), 1),
    claims: migrateClaims(input.claims, knownIds),
    settings,
  };
}

export function load(): SaveData {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return defaultSave();
    return migrate(JSON.parse(stored));
  } catch {
    // Private browsing, disabled storage, or garbage in the slot. Carry on.
    return defaultSave();
  }
}

/** Returns false when the save could not be written, e.g. storage is blocked. */
export function save(data: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clear(): boolean {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

export function exportJson(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

/** Returns null when the text is not parseable, so the UI can say so. */
export function importJson(text: string): SaveData | null {
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}
