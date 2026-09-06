/**
 * High scores and settings live in localStorage on the device and nowhere else
 * - there is no server and no account, so nothing about who is playing ever
 * leaves the tablet.
 *
 * Every entry point here is total: a corrupt, absent or older save must produce
 * a playable default rather than an exception. Losing a high score table is
 * annoying; a white screen on a child's tablet is worse.
 */
import type { MissionId } from '../game/missions';

const KEY = 'roxy-pinball:save';
export const SAVE_VERSION = 1;

/** Five is enough for a family and short enough to read at a glance. */
export const HIGH_SCORE_SLOTS = 5;

export interface HighScore {
  readonly score: number;
  /** Missions finished in that game, which is the other thing to brag about. */
  readonly missions: number;
  /** Local calendar date, as YYYY-MM-DD. */
  readonly day: string;
}

export interface Settings {
  readonly muted: boolean;
}

export interface SaveData {
  readonly version: number;
  readonly highScores: readonly HighScore[];
  /** Every mission ever finished, across all games, for the attract screen. */
  readonly missionsSeen: readonly MissionId[];
  readonly gamesPlayed: number;
  readonly settings: Settings;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    highScores: [],
    missionsSeen: [],
    gamesPlayed: 0,
    settings: { muted: false },
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Coerce whatever came out of storage into valid SaveData. Unknown fields are
 * dropped and missing ones defaulted, so an older save upgrades in place rather
 * than being thrown away.
 */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;

  const highScores = Array.isArray(input.highScores)
    ? input.highScores
        .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
        .map((entry) => ({
          score: Math.max(0, Math.floor(num(entry.score, 0))),
          missions: Math.max(0, Math.floor(num(entry.missions, 0))),
          day: str(entry.day, ''),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, HIGH_SCORE_SLOTS)
    : [];

  const missionsSeen = Array.isArray(input.missionsSeen)
    ? (input.missionsSeen.filter((id) => typeof id === 'string') as MissionId[])
    : [];

  const settings =
    typeof input.settings === 'object' && input.settings !== null
      ? (input.settings as Record<string, unknown>)
      : {};

  return {
    version: SAVE_VERSION,
    highScores,
    missionsSeen: [...new Set(missionsSeen)],
    gamesPlayed: Math.max(0, Math.floor(num(input.gamesPlayed, 0))),
    settings: { muted: bool(settings.muted, base.settings.muted) },
  };
}

export function load(): SaveData {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return defaultSave();
    return migrate(JSON.parse(text));
  } catch {
    // Private browsing, disabled storage, or garbage in the slot. Play anyway.
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

/** Where a score would land in the table, or -1 if it would not make it. */
export function rankOf(data: SaveData, score: number): number {
  if (score <= 0) return -1;
  const index = data.highScores.findIndex((entry) => score > entry.score);
  if (index >= 0) return index;
  return data.highScores.length < HIGH_SCORE_SLOTS ? data.highScores.length : -1;
}

/** Fold a finished game into the save. `day` comes from the caller's clock. */
export function recordGame(
  data: SaveData,
  score: number,
  missions: readonly MissionId[],
  day: string,
): SaveData {
  const highScores = [...data.highScores, { score: Math.round(score), missions: missions.length, day }]
    .filter((entry) => entry.score > 0)
    // A tie keeps the older run ahead: the first person to get there owns it.
    .sort((a, b) => b.score - a.score)
    .slice(0, HIGH_SCORE_SLOTS);

  return {
    ...data,
    highScores,
    missionsSeen: [...new Set([...data.missionsSeen, ...missions])],
    gamesPlayed: data.gamesPlayed + 1,
  };
}

/** Today as YYYY-MM-DD in the player's own timezone, not UTC. */
export function today(now = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
