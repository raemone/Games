import { vi } from 'vitest';
import { defaultSettings } from '../src/core/model';
import type { Log, Person, SaveData } from '../src/core/model';
import { SAVE_VERSION } from '../src/core/storage';

export function person(id: string, name = id.toUpperCase()): Person {
  return { id, name, emoji: '🐶', color: '#ffd88a', retired: false };
}

export function saveWith(people: readonly Person[], log: Log, weeklyGoal = 25): SaveData {
  return {
    version: SAVE_VERSION,
    people,
    nextPersonId: people.length + 1,
    log,
    settings: { ...defaultSettings(), weeklyGoal },
  };
}

/** A log for one person from `{ day: count }`. */
export function logFor(personId: string, days: Readonly<Record<string, number>>): Log {
  const log: Record<string, Record<string, number>> = {};
  for (const [day, count] of Object.entries(days)) {
    if (count > 0) log[day] = { [personId]: count };
  }
  return log;
}

/** Recursively freeze, so a test can prove a reducer did not mutate its input. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const inner of Object.values(value)) deepFreeze(inner);
  return Object.freeze(value);
}

/** A Map-backed stand-in for localStorage, as roxy-run's storage test uses. */
export function installFakeStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const fake: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
  };
  vi.stubGlobal('localStorage', fake);
  return store;
}

/** Storage that throws on every access, as in a locked-down private window. */
export function installBlockedStorage(): void {
  const blocked = (): never => {
    throw new Error('storage is blocked');
  };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
}
