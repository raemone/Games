/**
 * Talking to the world board.
 *
 * Two rules run through all of this. The first is that the leaderboard is
 * optional: the game is played on a tablet in a garden, and it has to work
 * exactly as well on a bad connection, on a plane, or with no board configured
 * at all. So nothing here ever throws, nothing blocks the game loop, and every
 * call answers with null rather than an error the game would have to handle.
 *
 * The second is that a player is a random id and up to three characters. There
 * is no account, no email and no name - the least a leaderboard can know while
 * still being a leaderboard.
 */

/** Where the API lives. Empty at build time means the board is simply off. */
const BASE = (import.meta.env.VITE_LEADERBOARD_URL ?? '').replace(/\/$/, '');

/** Long enough for a sleepy function to wake, short enough not to hang a menu. */
const TIMEOUT_MS = 6000;

export interface BoardRow {
  readonly rank: number;
  readonly initials: string;
  readonly score: number;
  readonly timeMs: number;
  /** True for the row belonging to this device. */
  readonly you: boolean;
}

export interface Standing {
  readonly rank: number;
  readonly initials: string;
  readonly score: number;
  readonly timeMs: number;
}

export interface Board {
  readonly levelId: string;
  /** How many players have posted on this level, not how many rows came back. */
  readonly players: number;
  readonly entries: readonly BoardRow[];
  /** This device's standing, even when it is off the end of the page. */
  readonly you: Standing | null;
}

export interface RunToPost {
  readonly levelId: string;
  readonly playerId: string;
  readonly initials: string;
  readonly score: number;
  readonly timeMs: number;
}

/** True when a board URL was configured at build time. */
export function boardEnabled(): boolean {
  return BASE.length > 0;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = '???'): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function toStanding(raw: unknown): Standing | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const rank = num(record.rank);
  if (rank <= 0) return null;
  return {
    rank,
    initials: str(record.initials),
    score: num(record.score),
    timeMs: num(record.timeMs),
  };
}

function toBoard(levelId: string, raw: unknown): Board | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const list = Array.isArray(record.entries) ? record.entries : [];

  const entries = list.map((item, index) => {
    const row = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return {
      rank: num(row.rank, index + 1),
      initials: str(row.initials),
      score: num(row.score),
      timeMs: num(row.timeMs),
      you: row.you === true,
    };
  });

  return { levelId, players: num(record.players, entries.length), entries, you: toStanding(record.you) };
}

/**
 * Fetch with a deadline, and no exceptions on the way out.
 *
 * An AbortController rather than AbortSignal.timeout, because this game runs on
 * whatever iPad the family already owns and the older ones do not have it.
 */
async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!boardEnabled()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    // Offline, blocked, timed out, or the board is having a bad day. The game
    // carries on either way, so there is nothing to report but "no board".
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The top runs on a level, or null when the board could not be reached. */
export async function fetchBoard(levelId: string, playerId: string, limit = 10): Promise<Board | null> {
  const query = new URLSearchParams({ level: levelId, limit: String(limit) });
  if (playerId) query.set('player', playerId);
  return toBoard(levelId, await request(`/api/leaderboard?${query.toString()}`));
}

/** Post a run and return where it landed, or null if it did not get through. */
export async function postRun(run: RunToPost): Promise<Standing | null> {
  const payload = await request('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  });
  if (typeof payload !== 'object' || payload === null) return null;
  return toStanding((payload as Record<string, unknown>).you);
}
