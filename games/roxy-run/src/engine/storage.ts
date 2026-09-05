/**
 * Progress lives in localStorage on the device and nowhere else - there is no
 * server and no account, so nothing about who is playing ever leaves the tablet.
 *
 * Every entry point here is total: a corrupt, absent or older save must produce
 * a playable default rather than an exception. Losing a save is annoying;
 * a white screen on a child's tablet is worse.
 */

const KEY = 'roxy-run:save';
export const SAVE_VERSION = 2;

/**
 * Whether this device posts its runs to the world board.
 *
 * Three states rather than a boolean, because "we have not asked yet" is not
 * the same as "no". Posting a child's initials and score to a public board is
 * a decision someone should actually make, so the game asks once, the first
 * time there is something to post, and never again.
 */
export type SharePreference = 'ask' | 'yes' | 'no';

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
  readonly share: SharePreference;
}

export interface SaveData {
  readonly version: number;
  /**
   * The id currently posting to the world board.
   *
   * A random id rather than an account, so the board can recognise a returning
   * player without knowing anything about them. Clearing the browser's storage
   * makes new players of everyone, which is the honest trade for having no
   * accounts at all.
   */
  readonly playerId: string;
  /** Up to three characters shown on the world board. Empty until chosen. */
  readonly initials: string;
  /**
   * Every set of initials used on this device, and the id that belongs to it.
   *
   * One tablet gets passed between children, and each of them is a different
   * player. Tying the id to the device instead made them one: because every
   * score is stored under the id, typing new initials renamed every score the
   * tablet had ever posted, on every board, to whoever typed last.
   *
   * So the initials pick the player. New initials mean a new id and a fresh
   * set of scores; the old ones keep the name they were posted under. Typing a
   * set again returns to that player, which is what makes handing the tablet
   * back and forth work.
   */
  readonly players: Readonly<Record<string, string>>;
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
    playerId: newPlayerId(),
    initials: '',
    players: {},
    unlockedWorld: 1,
    levels: {},
    totalBones: 0,
    settings: { muted: false, mirrorTouch: false, share: 'ask' },
  };
}

/** Sixteen hex characters of randomness. The server accepts nothing else. */
export function newPlayerId(): string {
  const bytes = new Uint8Array(8);
  const source = globalThis.crypto;
  if (source?.getRandomValues) source.getRandomValues(bytes);
  // No crypto at all is old or exotic, but a duplicate id is far better than a
  // crash on boot.
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Clean up initials the way the server will: uppercase, A-Z and 0-9, three at most. */
export function cleanInitials(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

function sharePreference(value: unknown): SharePreference {
  return value === 'yes' || value === 'no' ? value : 'ask';
}

/**
 * Switch the device to whoever these initials belong to.
 *
 * Returns the save unchanged in every way but the player: their id, ready for
 * the next run to be posted under. Initials never used here before get a new
 * id, so their scores start empty rather than inheriting someone else's.
 *
 * Pure, because this is the rule the whole bug turned on and it should be
 * readable and testable without a browser.
 */
export function withInitials(data: SaveData, raw: string): SaveData {
  const initials = cleanInitials(raw);
  if (initials === '') return data;

  // Before anyone has chosen, the device's starting id is nobody's yet - so
  // the first player keeps it rather than stranding it.
  const unclaimed = data.initials === '' && Object.keys(data.players).length === 0;
  const playerId = data.players[initials] ?? (unclaimed ? data.playerId : newPlayerId());

  return {
    ...data,
    initials,
    playerId,
    players: { ...data.players, [initials]: playerId },
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

  // A save written before the world board existed has no player id; minting one
  // here is what upgrades it in place, rather than throwing the save away.
  const playerId =
    typeof input.playerId === 'string' && /^[0-9a-f]{16}$/.test(input.playerId)
      ? input.playerId
      : base.playerId;

  const initials = cleanInitials(input.initials);
  const players: Record<string, string> = {};
  if (typeof input.players === 'object' && input.players !== null) {
    for (const [key, value] of Object.entries(input.players as Record<string, unknown>)) {
      const name = cleanInitials(key);
      if (name !== '' && typeof value === 'string' && /^[0-9a-f]{16}$/.test(value)) {
        players[name] = value;
      }
    }
  }
  // A save from before the board knew about several players has one set of
  // initials and one id: that pairing is the first player, and keeping it here
  // is what stops the upgrade from orphaning the scores already posted.
  if (initials !== '' && players[initials] === undefined) players[initials] = playerId;

  return {
    version: SAVE_VERSION,
    playerId,
    initials,
    players,
    unlockedWorld: Math.max(1, Math.floor(num(input.unlockedWorld, 1))),
    levels,
    totalBones: Math.max(0, Math.floor(num(input.totalBones, 0))),
    settings: {
      muted: bool(settings.muted, base.settings.muted),
      mirrorTouch: bool(settings.mirrorTouch, base.settings.mirrorTouch),
      share: sharePreference(settings.share),
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
