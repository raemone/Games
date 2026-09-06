/**
 * The global leaderboard.
 *
 * GET  /api/scores        the top of the board
 * POST /api/scores        submit a finished game, and get back where it landed
 *
 * Storage is one Redis sorted set, which is what a leaderboard is: the top N
 * and a player's rank are each a single command, with no schema and nothing to
 * migrate. Upstash speaks HTTP, so this talks to it with `fetch` and the whole
 * thing stays dependency-free.
 *
 * The checks below are deliberately light. Anyone can POST to a public
 * endpoint, and nothing short of replaying the game server-side makes that
 * untrue; what these do is keep out the casual nonsense - a typed-in billion, a
 * script hammering the endpoint, a name nobody wants on a family's board -
 * without pretending to be security. If the board ever matters more than that,
 * the honest fix is to send the input log and re-simulate it here, which the
 * fixed-timestep physics would make possible.
 */

export const config = { runtime: 'edge' };

/**
 * Declared here rather than by pulling in @types/node, which would put Node's
 * globals into the whole project's type space for the sake of two lookups.
 */
declare const process: { env: Record<string, string | undefined> };

const KEY = 'roxy-pinball:scores';
/** Keeping more than this costs storage and nobody scrolls that far. */
const BOARD_LIMIT = 200;
const PAGE_SIZE = 20;

/** Nothing legitimate gets near this. */
const MAX_SCORE = 500_000_000;
/** Three balls cannot be played faster than this, however badly. */
const MIN_SECONDS = 15;
/**
 * The best minute anyone has ever had, times a wide margin. A run that claims
 * more points per second than this did not happen.
 */
const MAX_POINTS_PER_SECOND = 300_000;

const RATE_LIMIT = 12;
const RATE_WINDOW_SECONDS = 600;

const NAME_MAX = 12;
/** Letters, digits, spaces and the punctuation that turns up in real names. */
const NAME_ALLOWED = /[^A-Z0-9 '\-.]/g;
/** Not a filter, a doormat. Anything cleverer belongs in a moderation queue. */
const BLOCKED = ['FUCK', 'SHIT', 'CUNT', 'NIGGER', 'FAGGOT', 'RAPE', 'NAZI', 'BITCH'];

interface Entry {
  readonly name: string;
  readonly score: number;
  readonly missions: number;
  readonly day: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // The board is public and read-only to anyone who asks; the protection
      // that matters is the validation below, not the origin header.
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'cache-control': 'no-store',
    },
  });
}

/** One Redis command over Upstash's HTTP interface. */
async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('leaderboard is not configured');

  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`redis ${response.status}`);
  const body = (await response.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result;
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return 'ANON';
  const name = raw
    .toUpperCase()
    .replace(NAME_ALLOWED, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  if (!name) return 'ANON';
  // Substring match, so spacing tricks do not walk straight past it.
  const squashed = name.replace(/[^A-Z]/g, '');
  return BLOCKED.some((word) => squashed.includes(word)) ? 'GOOD DOG' : name;
}

/** A stored row. The id is only there to keep two identical games distinct. */
function encode(entry: Entry): string {
  return JSON.stringify({
    n: entry.name,
    m: entry.missions,
    d: entry.day,
    i: crypto.randomUUID().slice(0, 8),
  });
}

function decode(member: string, score: number): Entry {
  try {
    const row = JSON.parse(member) as { n?: unknown; m?: unknown; d?: unknown };
    return {
      name: typeof row.n === 'string' ? row.n : 'ANON',
      score,
      missions: typeof row.m === 'number' ? row.m : 0,
      day: typeof row.d === 'string' ? row.d : '',
    };
  } catch {
    // A row we cannot read is still a score; showing it beats dropping it.
    return { name: 'ANON', score, missions: 0, day: '' };
  }
}

/** ZREVRANGE ... WITHSCORES comes back as a flat [member, score, ...] list. */
async function readTop(limit: number): Promise<Entry[]> {
  const raw = (await redis(['ZREVRANGE', KEY, 0, limit - 1, 'WITHSCORES'])) as unknown;
  if (!Array.isArray(raw)) return [];
  const entries: Entry[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const member = String(raw[i]);
    const score = Number(raw[i + 1]);
    if (Number.isFinite(score)) entries.push(decode(member, score));
  }
  return entries;
}

/** Returns false when this address has submitted too often lately. */
async function withinRateLimit(ip: string): Promise<boolean> {
  const key = `roxy-pinball:rl:${ip}`;
  const count = Number(await redis(['INCR', key]));
  if (count === 1) await redis(['EXPIRE', key, RATE_WINDOW_SECONDS]);
  return count <= RATE_LIMIT;
}

interface Submission {
  readonly name: string;
  readonly score: number;
  readonly missions: number;
  readonly seconds: number;
  readonly day: string;
}

/** Returns the reason a submission is rejected, or null if it looks like a game. */
function reject(body: Submission): string | null {
  if (!Number.isInteger(body.score) || body.score <= 0) return 'that is not a score';
  if (body.score > MAX_SCORE) return 'that score is not possible';
  if (!Number.isInteger(body.missions) || body.missions < 0 || body.missions > 6) {
    return 'that mission count is not possible';
  }
  if (!Number.isFinite(body.seconds) || body.seconds < MIN_SECONDS) {
    return 'that game was too short to have happened';
  }
  if (body.score > body.seconds * MAX_POINTS_PER_SECOND) {
    return 'that score is too high for a game that long';
  }
  return null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });

  try {
    if (request.method === 'GET') {
      return json({ top: await readTop(PAGE_SIZE) });
    }

    if (request.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405);
    }

    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw) return json({ error: 'expected a JSON body' }, 400);

    const submission: Submission = {
      name: cleanName(raw.name),
      score: Math.round(Number(raw.score)),
      missions: Math.round(Number(raw.missions)),
      seconds: Number(raw.seconds),
      day: typeof raw.day === 'string' ? raw.day.slice(0, 10) : '',
    };

    const problem = reject(submission);
    if (problem) return json({ error: problem }, 422);

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!(await withinRateLimit(ip))) {
      return json({ error: 'too many scores from here just now' }, 429);
    }

    const member = encode(submission);
    await redis(['ZADD', KEY, submission.score, member]);
    // Trim from the bottom, so the set stays the size of the board.
    await redis(['ZREMRANGEBYRANK', KEY, 0, -(BOARD_LIMIT + 1)]);

    const rank = await redis(['ZREVRANK', KEY, member]);
    return json({
      ok: true,
      // Null means the score fell off the bottom of the board, not that it failed.
      rank: typeof rank === 'number' ? rank : null,
      top: await readTop(PAGE_SIZE),
    });
  } catch (error) {
    // The game plays perfectly well with no board at all, so a leaderboard that
    // is down must say so plainly and never look like the game is broken.
    const message = error instanceof Error ? error.message : 'leaderboard unavailable';
    return json({ error: message }, 503);
  }
}
