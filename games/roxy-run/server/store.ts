/**
 * Where the board lives.
 *
 * Two implementations behind one interface: Redis for the deployed function,
 * and an in-memory map for tests and for `vercel dev` before anyone has
 * attached a database. The memory one is not a toy - it is what makes the
 * whole API runnable and testable without a network - but it is per-instance
 * and forgotten on restart, so a deployment with no database attached hands
 * out boards that empty themselves. The API says so in its health response
 * rather than pretending otherwise.
 */
import type { Redis } from './protocol.js';

export interface Entry {
  readonly playerId: string;
  readonly initials: string;
  readonly score: number;
  readonly timeMs: number;
}

export interface Standing {
  /** 1-based place on the score board. */
  readonly rank: number;
  readonly entry: Entry;
}

export interface Store {
  /** Record a run, keeping the player's best score and best time. */
  submit(levelId: string, entry: Entry): Promise<void>;
  /** The best `limit` runs on a level, best first. */
  top(levelId: string, limit: number): Promise<Entry[]>;
  /** Where one player stands on a level, or null if they have never posted. */
  standing(levelId: string, playerId: string): Promise<Standing | null>;
  /** How many players have posted on a level. */
  count(levelId: string): Promise<number>;
  /** Count one request against a window. Returns false when the caller is over. */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

const PREFIX = 'roxy:v1';
const scoreKey = (levelId: string): string => `${PREFIX}:score:${levelId}`;
const timeKey = (levelId: string): string => `${PREFIX}:time:${levelId}`;
const NAMES_KEY = `${PREFIX}:names`;

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback;
}

function initialsOf(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '???';
}

/**
 * Best first: highest score, and where two players tie, the faster run.
 *
 * The sort happens here rather than in the database because the score and the
 * time are two separate sorted sets - the same reason the game keeps a best
 * score and a best time per level rather than one "best run". Redis breaks a
 * score tie by player id, which is meaningless to a reader, so the page gets
 * re-sorted once it has both numbers.
 */
export function bestFirst(a: Entry, b: Entry): number {
  return b.score - a.score || a.timeMs - b.timeMs;
}

export class RedisStore implements Store {
  constructor(private readonly redis: Redis) {}

  /**
   * GT and LT replace an existing member only when the new value is better, so
   * a worse run is a no-op in the database rather than a read, a comparison
   * and a write from here - which two tablets finishing at once would race.
   */
  async submit(levelId: string, entry: Entry): Promise<void> {
    await this.redis.pipeline([
      ['ZADD', scoreKey(levelId), 'GT', 'CH', entry.score, entry.playerId],
      ['ZADD', timeKey(levelId), 'LT', 'CH', entry.timeMs, entry.playerId],
      ['HSET', NAMES_KEY, entry.playerId, entry.initials],
    ]);
  }

  async top(levelId: string, limit: number): Promise<Entry[]> {
    const raw = await this.redis.command(['ZRANGE', scoreKey(levelId), 0, limit - 1, 'REV', 'WITHSCORES']);
    const flat = Array.isArray(raw) ? raw : [];
    if (flat.length === 0) return [];

    const ids: string[] = [];
    const scores = new Map<string, number>();
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const id = String(flat[i]);
      ids.push(id);
      scores.set(id, num(flat[i + 1]));
    }

    const [names, times] = await this.redis.pipeline([
      ['HMGET', NAMES_KEY, ...ids],
      ['ZMSCORE', timeKey(levelId), ...ids],
    ]);
    const nameList = Array.isArray(names) ? names : [];
    const timeList = Array.isArray(times) ? times : [];

    return ids
      .map((playerId, index) => ({
        playerId,
        initials: initialsOf(nameList[index]),
        score: scores.get(playerId) ?? 0,
        timeMs: num(timeList[index]),
      }))
      .sort(bestFirst);
  }

  async standing(levelId: string, playerId: string): Promise<Standing | null> {
    const [rank, score, time, name] = await this.redis.pipeline([
      ['ZREVRANK', scoreKey(levelId), playerId],
      ['ZSCORE', scoreKey(levelId), playerId],
      ['ZSCORE', timeKey(levelId), playerId],
      ['HGET', NAMES_KEY, playerId],
    ]);

    // A missing rank is null, and null is also what rank 0 is not - so test the
    // score, which is absent only when the player has never posted here.
    if (score === null || score === undefined) return null;

    return {
      rank: num(rank) + 1,
      entry: {
        playerId,
        initials: initialsOf(name),
        score: num(score),
        timeMs: num(time),
      },
    };
  }

  async count(levelId: string): Promise<number> {
    return num(await this.redis.command(['ZCARD', scoreKey(levelId)]));
  }

  /**
   * A fixed window rather than a sliding one: two commands, no bookkeeping,
   * and the worst case is that someone gets a double allowance across a window
   * boundary. For keeping one tablet from hammering the board, that is plenty.
   */
  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const full = `${PREFIX}:rl:${key}:${bucket}`;
    const [count] = await this.redis.pipeline([
      ['INCR', full],
      ['EXPIRE', full, windowSeconds],
    ]);
    return num(count, 1) <= limit;
  }
}

/** The same store, in a Map. Used by the tests and whenever Redis is absent. */
export class MemoryStore implements Store {
  private readonly boards = new Map<string, Map<string, Entry>>();
  private readonly hits = new Map<string, number>();

  private board(levelId: string): Map<string, Entry> {
    const existing = this.boards.get(levelId);
    if (existing) return existing;
    const created = new Map<string, Entry>();
    this.boards.set(levelId, created);
    return created;
  }

  async submit(levelId: string, entry: Entry): Promise<void> {
    const board = this.board(levelId);
    const previous = board.get(entry.playerId);
    board.set(entry.playerId, {
      playerId: entry.playerId,
      initials: entry.initials,
      score: Math.max(previous?.score ?? 0, entry.score),
      timeMs: previous ? Math.min(previous.timeMs, entry.timeMs) : entry.timeMs,
    });
  }

  async top(levelId: string, limit: number): Promise<Entry[]> {
    return [...this.board(levelId).values()].sort(bestFirst).slice(0, limit);
  }

  async standing(levelId: string, playerId: string): Promise<Standing | null> {
    const ordered = [...this.board(levelId).values()].sort(bestFirst);
    const index = ordered.findIndex((entry) => entry.playerId === playerId);
    const entry = ordered[index];
    if (!entry) return null;
    return { rank: index + 1, entry };
  }

  async count(levelId: string): Promise<number> {
    return this.board(levelId).size;
  }

  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const full = `${key}:${bucket}`;
    const count = (this.hits.get(full) ?? 0) + 1;
    this.hits.set(full, count);
    return count <= limit;
  }
}
