/**
 * Everything arriving from a browser, checked before it can reach the database.
 *
 * Be honest about what this is: plausibility checking, not proof. The game runs
 * entirely on the player's machine, so a determined adult with the network tab
 * open can post a run they never played. What these rules buy is that the board
 * cannot be filled with 999999999s, junk, or a thousand rows a second, which is
 * what actually ruins a leaderboard a family looks at. See the README for what
 * proving a run would take.
 */
import { levelById } from './levels';

/**
 * Well above anything a real run pays.
 *
 * A level's bones, bops and end-of-level bonus together come to a few tens of
 * thousands; the cap sits an order of magnitude clear of that so it never
 * rejects an unusually good run, only obvious nonsense.
 */
export const MAX_SCORE = 250_000;

/**
 * No level can be crossed faster than this.
 *
 * The levels are twenty-six segments of twenty-four tiles, so roughly ten
 * thousand pixels; Roxy tops out near six pixels a tick, which is about
 * twenty-eight seconds of holding right on the shortest one. Fifteen leaves
 * room for a route nobody has found yet.
 */
export const MIN_TIME_MS = 15_000;

/** Initials, arcade style. Three characters keeps the board tidy and readable. */
export const MAX_INITIALS = 3;

/**
 * Three-letter combinations that will not go on a board a child reads.
 *
 * A short list, not a filter: with three characters the space of unpleasant
 * things is small enough to name, and anything subtler than this is not worth
 * pretending to catch.
 */
const BLOCKED_INITIALS = new Set([
  'ASS', 'CUM', 'FAG', 'FUC', 'FUK', 'FCK', 'GAY', 'JIZ', 'KKK',
  'NIG', 'PIS', 'POO', 'PRN', 'SEX', 'SHT', 'TIT', 'TWT', 'VAG', 'WAN',
]);

export interface Submission {
  readonly levelId: string;
  readonly playerId: string;
  readonly initials: string;
  readonly score: number;
  readonly timeMs: number;
}

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Clean up initials the way an arcade cabinet would: uppercase, trimmed to
 * three, letters and digits only.
 *
 * Returns null when nothing usable is left, rather than silently posting a
 * blank row.
 */
export function normalizeInitials(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_INITIALS);
  if (cleaned.length === 0) return null;
  if (BLOCKED_INITIALS.has(cleaned)) return null;
  return cleaned;
}

/** Parse and check a posted run. The returned value is safe to store. */
export function parseSubmission(raw: unknown): Parsed<Submission> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'expected a JSON object' };
  const input = raw as Record<string, unknown>;

  const levelId = typeof input.levelId === 'string' ? input.levelId : '';
  const level = levelById(levelId);
  if (!level) return { ok: false, error: 'unknown levelId' };

  const playerId = typeof input.playerId === 'string' ? input.playerId : '';
  if (!/^[0-9a-f]{16}$/.test(playerId)) return { ok: false, error: 'playerId must be 16 hex characters' };

  const initials = normalizeInitials(input.initials);
  if (initials === null) return { ok: false, error: 'initials must be 1-3 letters or digits' };

  if (!isInteger(input.score) || input.score < 0 || input.score > MAX_SCORE) {
    return { ok: false, error: `score must be a whole number from 0 to ${MAX_SCORE}` };
  }

  if (!isInteger(input.timeMs) || input.timeMs < MIN_TIME_MS || input.timeMs > level.timeLimit * 1000) {
    return { ok: false, error: 'timeMs is outside what this level allows' };
  }

  return { ok: true, value: { levelId, playerId, initials, score: input.score, timeMs: input.timeMs } };
}

/**
 * How many rows a board request may ask for.
 *
 * An absent or unreadable limit takes the default rather than being coerced -
 * `Number(null)` is 0, which would otherwise clamp every board without an
 * explicit limit down to a single row.
 */
export function parseLimit(raw: string | null, fallback = 10, max = 50): number {
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}
