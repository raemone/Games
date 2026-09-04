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
import type { Log, Person, PersonId, SaveData, Settings } from './model';

const KEY = 'poop-patrol:save';
export const SAVE_VERSION = 1;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    people: [],
    nextPersonId: 1,
    log: {},
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

  return {
    version: SAVE_VERSION,
    people,
    // Repair a counter that would hand out an id already in use.
    nextPersonId: Math.max(nextPersonId, Math.floor(num(input.nextPersonId, 1)), 1),
    log: migrateLog(input.log, knownIds),
    settings: migrateSettings(input.settings),
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
