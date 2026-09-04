/**
 * Progress lives in localStorage on the device and nowhere else - there is no
 * server and no account, so nothing about who is playing ever leaves the tablet.
 *
 * Every entry point here is total: a corrupt, absent or older save must produce
 * a playable default rather than an exception. Losing a save is annoying;
 * a white screen on a child's tablet is worse.
 */

const KEY = 'roxy-run:save';
export const SAVE_VERSION = 1;

export interface LevelRecord {
  readonly bestScore: number;
  /** Best completion time in milliseconds. */
  readonly bestTimeMs: number;
  readonly completed: boolean;
}

export interface Settings {
  readonly muted: boolean;
  /** Touch controls on the left, for left-handed players. */
  readonly mirrorTouch: boolean;
}

export interface SaveData {
  readonly version: number;
  /** Highest world number the player may enter, 1-based. */
  readonly unlockedWorld: number;
  /** Per-level records keyed by level id. */
  readonly levels: Readonly<Record<string, LevelRecord>>;
  readonly totalBones: number;
  readonly settings: Settings;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    unlockedWorld: 1,
    levels: {},
    totalBones: 0,
    settings: { muted: false, mirrorTouch: false },
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Coerce whatever came out of storage into a valid SaveData.
 * Unknown fields are dropped and missing ones defaulted, so an older save
 * upgrades in place instead of being thrown away.
 */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (typeof raw !== 'object' || raw === null) return base;

  const input = raw as Record<string, unknown>;
  const levels: Record<string, LevelRecord> = {};

  if (typeof input.levels === 'object' && input.levels !== null) {
    for (const [id, value] of Object.entries(input.levels as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const record = value as Record<string, unknown>;
      levels[id] = {
        bestScore: Math.max(0, num(record.bestScore, 0)),
        bestTimeMs: Math.max(0, num(record.bestTimeMs, 0)),
        completed: bool(record.completed, false),
      };
    }
  }

  const settings =
    typeof input.settings === 'object' && input.settings !== null
      ? (input.settings as Record<string, unknown>)
      : {};

  return {
    version: SAVE_VERSION,
    unlockedWorld: Math.max(1, Math.floor(num(input.unlockedWorld, 1))),
    levels,
    totalBones: Math.max(0, Math.floor(num(input.totalBones, 0))),
    settings: {
      muted: bool(settings.muted, base.settings.muted),
      mirrorTouch: bool(settings.mirrorTouch, base.settings.mirrorTouch),
    },
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

/** Fold a finished level into the save, keeping the player's best of each. */
export function recordResult(
  data: SaveData,
  levelId: string,
  score: number,
  timeMs: number,
  bonesCollected: number,
  unlocksWorld: number,
): SaveData {
  const previous = data.levels[levelId];
  return {
    ...data,
    unlockedWorld: Math.max(data.unlockedWorld, unlocksWorld),
    totalBones: data.totalBones + Math.max(0, bonesCollected),
    levels: {
      ...data.levels,
      [levelId]: {
        bestScore: Math.max(previous?.bestScore ?? 0, score),
        // A previous time of 0 means "never finished", so it must not win.
        bestTimeMs:
          previous?.completed && previous.bestTimeMs > 0
            ? Math.min(previous.bestTimeMs, timeMs)
            : timeMs,
        completed: true,
      },
    },
  };
}
