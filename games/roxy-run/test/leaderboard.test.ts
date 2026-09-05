/**
 * The board client, which has one job beyond fetching: never, under any
 * circumstances, to break the game. Every test here is really the same test -
 * a bad answer from the network becomes null, not an exception.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardEnabled, fetchBoard, postRun } from '../src/engine/leaderboard';

const PLAYER = '0123456789abcdef';

const RUN = {
  levelId: 'w1-1',
  playerId: PLAYER,
  initials: 'ROX',
  score: 4200,
  timeMs: 61_000,
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

/** The arguments of one fetch call, with the strictness of the tsconfig satisfied. */
function callArgs(index: number): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`no fetch call at ${index}`);
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('boardEnabled', () => {
  it('is on for these tests, because a URL is configured', () => {
    // vite.config.ts sets VITE_LEADERBOARD_URL for the test run; without it
    // every call below would short-circuit and prove nothing.
    expect(boardEnabled()).toBe(true);
  });
});

describe('fetchBoard', () => {
  it('asks for the level, the limit and this player', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ levelId: 'w1-1', players: 0, entries: [] }));
    await fetchBoard('w1-1', PLAYER, 5);

    const url = new URL(callArgs(0).url);
    expect(url.pathname).toBe('/api/leaderboard');
    expect(url.searchParams.get('level')).toBe('w1-1');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('player')).toBe(PLAYER);
  });

  it('reads a board back', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        levelId: 'w1-1',
        players: 12,
        entries: [
          { rank: 1, initials: 'RAE', score: 9000, timeMs: 40_000, you: false },
          { rank: 2, initials: 'ROX', score: 4200, timeMs: 61_000, you: true },
        ],
        you: { rank: 2, initials: 'ROX', score: 4200, timeMs: 61_000 },
      }),
    );

    const board = await fetchBoard('w1-1', PLAYER);
    expect(board?.players).toBe(12);
    expect(board?.entries.map((row) => row.initials)).toEqual(['RAE', 'ROX']);
    expect(board?.entries[1]?.you).toBe(true);
    expect(board?.you?.rank).toBe(2);
  });

  it('fills in what a malformed row leaves out rather than throwing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ entries: [{}, 'nonsense'] }));

    const board = await fetchBoard('w1-1', PLAYER);
    expect(board?.entries).toHaveLength(2);
    expect(board?.entries[0]).toEqual({ rank: 1, initials: '???', score: 0, timeMs: 0, you: false });
    expect(board?.players).toBe(2);
  });

  it('is null when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await fetchBoard('w1-1', PLAYER)).toBeNull();
  });

  it('is null when the server answers with an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, false));
    expect(await fetchBoard('w1-1', PLAYER)).toBeNull();
  });

  it('is null when the answer is not a board at all', async () => {
    fetchMock.mockResolvedValue(jsonResponse('a string'));
    expect(await fetchBoard('w1-1', PLAYER)).toBeNull();
  });

  it('gives up rather than hanging forever', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const pending = fetchBoard('w1-1', PLAYER);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });
});

describe('postRun', () => {
  it('posts the run as JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ you: { rank: 3, initials: 'ROX', score: 4200, timeMs: 61_000 } }));

    const standing = await postRun(RUN);
    const { init } = callArgs(0);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(RUN);
    expect(standing?.rank).toBe(3);
  });

  it('is null when the run was refused', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'score too high' }, false));
    expect(await postRun(RUN)).toBeNull();
  });

  it('is null when the answer carries no standing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ you: null }));
    expect(await postRun(RUN)).toBeNull();
  });

  it('is null when the network fails, without throwing at the caller', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(postRun(RUN)).resolves.toBeNull();
  });
});
