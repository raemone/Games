/**
 * The client half of the global board.
 *
 * Every call here is allowed to fail and none of them may ever stop the game.
 * A tablet in a back garden with no signal has to play exactly as well as one
 * on wifi, so a network error means the global board is quietly absent, not
 * that anything is wrong. That is why nothing returns an exception and every
 * request has a short deadline: a leaderboard that hangs is worse than one
 * that is missing, because a hung one looks like a crash.
 */

export interface BoardEntry {
  readonly name: string;
  readonly score: number;
  readonly missions: number;
  readonly day: string;
}

export interface Submission {
  readonly name: string;
  readonly score: number;
  readonly missions: number;
  /** How long the game lasted. The server uses it to sanity-check the score. */
  readonly seconds: number;
  readonly day: string;
}

export interface SubmitResult {
  readonly rank: number | null;
  readonly top: readonly BoardEntry[];
}

/**
 * Same origin on Vercel, where the game and the API are one deployment. The
 * override exists so a copy served from anywhere else - GitHub Pages, a local
 * dev server - can still read the board rather than silently having none.
 */
const ENDPOINT = import.meta.env.VITE_SCORES_API ?? '/api/scores';

/** Long enough for a cold serverless start, short enough not to feel stuck. */
const TIMEOUT_MS = 6000;

const NAME_KEY = 'roxy-pinball:name';
export const NAME_MAX_LENGTH = 12;

function isEntry(value: unknown): value is BoardEntry {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.name === 'string' && typeof row.score === 'number';
}

function readEntries(value: unknown): BoardEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEntry).map((entry) => ({
    name: entry.name,
    score: entry.score,
    missions: typeof entry.missions === 'number' ? entry.missions : 0,
    day: typeof entry.day === 'string' ? entry.day : '',
  }));
}

async function request(init: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, { ...init, signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
          ? (body as { error: string }).error
          : `the board said no (${response.status})`;
      return { error: message };
    }
    return body;
  } catch {
    // Offline, blocked, timed out, or no board deployed at all.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The top of the board, or null when there is no board to be had. */
export async function fetchTop(): Promise<BoardEntry[] | null> {
  const body = await request({ method: 'GET' });
  if (!body || typeof body !== 'object') return null;
  if ('error' in body) return null;
  return readEntries((body as { top?: unknown }).top);
}

export type SubmitOutcome =
  | { readonly kind: 'ok'; readonly result: SubmitResult }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'offline' };

export async function submitScore(submission: Submission): Promise<SubmitOutcome> {
  const body = await request({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
  if (!body || typeof body !== 'object') return { kind: 'offline' };
  if ('error' in body) {
    return { kind: 'rejected', reason: String((body as { error: unknown }).error) };
  }
  const row = body as { rank?: unknown; top?: unknown };
  return {
    kind: 'ok',
    result: {
      rank: typeof row.rank === 'number' ? row.rank : null,
      top: readEntries(row.top),
    },
  };
}

/** The name is remembered so nobody types it again after every game. */
export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, NAME_MAX_LENGTH));
  } catch {
    /* private browsing; they can type it again */
  }
}
