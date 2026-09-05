/**
 * The routes, exercised end to end against the memory store.
 *
 * A Vercel function is a plain function from Request to Response, so the whole
 * API can be tested by calling it - no server to start, no network, no mocks
 * beyond an empty environment.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as health } from '../../api/health';
import { GET, OPTIONS, POST } from '../../api/leaderboard';
import { resetBackend } from '../../server/context';

const API = 'https://roxy.example/api/leaderboard';
const ORIGIN = 'https://raemone.github.io';

const run = (over: Record<string, unknown> = {}) => ({
  levelId: 'w1-1',
  playerId: '0123456789abcdef',
  initials: 'ROX',
  score: 4200,
  timeMs: 61_000,
  ...over,
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function get(query: string, headers: Record<string, string> = {}): Request {
  return new Request(`${API}?${query}`, { headers: { origin: ORIGIN, ...headers } });
}

/** Node's fetch types call a parsed body `unknown`; these tests assert on its shape. */
async function body(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

beforeEach(() => {
  // No database attached, so every test starts on a fresh memory store. Every
  // variable a transport looks at has to be cleared, not just the REST pair:
  // one test stubs a connection string, and without this it leaks into the
  // next and quietly gives it a working database.
  for (const name of [
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'REDIS_URL',
    'KV_URL',
    'UPSTASH_REDIS_URL',
  ]) {
    vi.stubEnv(name, '');
  }
  resetBackend();
});

describe('POST /api/leaderboard', () => {
  it('accepts a run and answers with where it landed', async () => {
    const response = await POST(post(run()));
    expect(response.status).toBe(200);

    const parsed = await body(response);
    expect(parsed).toMatchObject({
      levelId: 'w1-1',
      players: 1,
      you: { rank: 1, initials: 'ROX', score: 4200, timeMs: 61_000 },
    });
  });

  it('ranks a second player behind a better one', async () => {
    await POST(post(run({ score: 9000 })));
    const response = await POST(post(run({ playerId: 'f'.repeat(16), initials: 'RAE', score: 100 })));

    expect((await body(response)).you.rank).toBe(2);
  });

  it('refuses a run it does not believe', async () => {
    const response = await POST(post(run({ score: 99_999_999 })));
    expect(response.status).toBe(400);
    expect((await body(response)).error).toContain('score');
  });

  it('refuses a body that is not JSON', async () => {
    const response = await POST(post('not json at all'));
    expect(response.status).toBe(400);
  });

  it('never caches a write', async () => {
    const response = await POST(post(run()));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/leaderboard', () => {
  it('returns an empty board rather than an error', async () => {
    const parsed = await body(await GET(get('level=w2-1')));
    expect(parsed).toEqual({ levelId: 'w2-1', players: 0, entries: [], you: null });
  });

  it('lists the best runs first, ranked', async () => {
    await POST(post(run({ playerId: '1'.repeat(16), initials: 'AAA', score: 100 })));
    await POST(post(run({ playerId: '2'.repeat(16), initials: 'BBB', score: 900 })));

    const parsed = await body(await GET(get('level=w1-1')));
    expect(parsed.entries.map((row: { initials: string; rank: number }) => [row.rank, row.initials])).toEqual([
      [1, 'BBB'],
      [2, 'AAA'],
    ]);
  });

  it('honours a limit without hiding how many players there are', async () => {
    for (let i = 0; i < 4; i++) {
      await POST(post(run({ playerId: String(i).repeat(16), score: 100 + i })));
    }

    const parsed = await body(await GET(get('level=w1-1&limit=2')));
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.players).toBe(4);
  });

  it('marks the asking player and reports their standing even off the page', async () => {
    await POST(post(run({ playerId: '1'.repeat(16), initials: 'AAA', score: 100 })));
    await POST(post(run({ playerId: '2'.repeat(16), initials: 'BBB', score: 900 })));

    const parsed = await body(await GET(get(`level=w1-1&limit=1&player=${'1'.repeat(16)}`)));
    expect(parsed.entries[0].you).toBe(false);
    expect(parsed.you).toMatchObject({ rank: 2, initials: 'AAA' });
  });

  it('refuses a level that does not exist', async () => {
    expect((await GET(get('level=w9-9'))).status).toBe(400);
    expect((await GET(get(''))).status).toBe(400);
  });

  it('lets the edge cache an anonymous board but never a personalised one', async () => {
    const shared = await GET(get('level=w1-1'));
    expect(shared.headers.get('cache-control')).toContain('s-maxage=10');

    const mine = await GET(get(`level=w1-1&player=${'1'.repeat(16)}`));
    expect(mine.headers.get('cache-control')).toBe('no-store');
  });
});

describe('rate limiting', () => {
  it('cuts off a caller posting far too fast', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.7' };
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) {
      codes.push((await POST(post(run({ score: 100 + i }), headers))).status);
    }
    expect(codes.filter((code) => code === 200)).toHaveLength(20);
    expect(codes.at(-1)).toBe(429);
  });

  it('counts each address on its own', async () => {
    for (let i = 0; i < 20; i++) {
      await POST(post(run(), { 'x-forwarded-for': '203.0.113.8' }));
    }
    const other = await POST(post(run(), { 'x-forwarded-for': '198.51.100.2' }));
    expect(other.status).toBe(200);
  });
});

describe('CORS', () => {
  it('lets the game read the board', async () => {
    const response = await GET(get('level=w1-1'));
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('lets the game read the answer to a posted run', async () => {
    // A POST is preflighted, and a reply with no allow header is unreadable to
    // the browser however good its contents are - which looks, from the game's
    // side, exactly like the run being rejected.
    const response = await POST(post(run()));
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('refuses an origin nobody allowed, rather than wildcarding it', async () => {
    const response = await GET(get('level=w1-1', { origin: 'https://not-the-game.example' }));
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a preflight with the allowed methods', async () => {
    const response = await OPTIONS(new Request(API, { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('GET /api/health', () => {
  it('admits when there is no database behind it', async () => {
    const parsed = await body(await health(new Request('https://roxy.example/api/health')));
    expect(parsed).toMatchObject({ ok: true, storage: 'memory', restVariablesSeen: [] });
    // Both halves: what it costs, and which of the three causes it is.
    expect(parsed.note).toContain('lost when the function restarts');
    expect(parsed.note).toContain('scoped to a different environment');
  });

  it('separates "nothing arrived" from "a store is connected"', async () => {
    // These looked identical from the game's side, and the difference is what
    // told us the store was attached over TCP rather than missing entirely.
    const nothing = await body(await health(new Request('https://roxy.example/api/health')));
    expect(nothing.storageVariablesSeen).toEqual([]);
    expect(nothing.note).toContain('scoped to a different environment');
    expect(nothing.transport).toBeNull();

    vi.stubEnv('REDIS_URL', 'redis://user:hunter2@somewhere.example:6379');
    resetBackend();

    // A redis:// URL is no longer the wrong protocol - it is now the one this
    // project runs on - so it reports a working store over a socket.
    const overSocket = await body(await health(new Request('https://roxy.example/api/health')));
    expect(overSocket).toMatchObject({ storage: 'redis', transport: 'tcp' });
    expect(overSocket.note).toBeUndefined();
    // The credential inside that URL must never reach an unauthenticated route.
    expect(JSON.stringify(overSocket)).not.toContain('hunter2');
    expect(JSON.stringify(overSocket)).not.toContain('somewhere.example');
  });

  it('names the variables it can see, and never their values', async () => {
    vi.stubEnv('KV_REST_API_URL', 'https://redis.example');
    resetBackend();

    const parsed = await body(await health(new Request('https://roxy.example/api/health')));
    expect(parsed.restVariablesSeen).toEqual(['KV_REST_API_URL']);
    expect(JSON.stringify(parsed)).not.toContain('redis.example');
    // A URL with no token is not a working store, and says so rather than
    // reporting a database that cannot answer.
    expect(parsed.storage).toBe('memory');
    expect(parsed.note).toContain('half configured');
  });
});
