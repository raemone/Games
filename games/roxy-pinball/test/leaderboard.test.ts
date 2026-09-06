import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTop, loadName, saveName, submitScore } from '../src/engine/leaderboard';
import type { Submission } from '../src/engine/leaderboard';

const GAME: Submission = {
  name: 'ROXY',
  score: 1_250_000,
  missions: 3,
  seconds: 180,
  day: '2026-09-06',
};

function respondWith(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

function failWith(error: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw error;
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as unknown as Storage);
});

describe('reading the board', () => {
  it('returns the rows the server sent', async () => {
    respondWith(200, {
      top: [{ name: 'ROXY', score: 900, missions: 2, day: '2026-01-01' }],
    });
    await expect(fetchTop()).resolves.toEqual([
      { name: 'ROXY', score: 900, missions: 2, day: '2026-01-01' },
    ]);
  });

  it('fills in fields the server left out rather than dropping the row', async () => {
    respondWith(200, { top: [{ name: 'ROXY', score: 900 }] });
    await expect(fetchTop()).resolves.toEqual([
      { name: 'ROXY', score: 900, missions: 0, day: '' },
    ]);
  });

  it('drops rows that are not scores at all', async () => {
    respondWith(200, { top: [null, 'nope', { name: 'OK', score: 5 }, { score: 9 }] });
    const top = await fetchTop();
    expect(top).toEqual([{ name: 'OK', score: 5, missions: 0, day: '' }]);
  });

  it('is simply absent when there is no network', async () => {
    // A tablet in a back garden with no signal must play exactly as well as one
    // on wifi, so this is null rather than an exception.
    failWith(new TypeError('Failed to fetch'));
    await expect(fetchTop()).resolves.toBeNull();
  });

  it('is absent when the board is deployed but broken', async () => {
    respondWith(503, { error: 'leaderboard is not configured' });
    await expect(fetchTop()).resolves.toBeNull();
  });

  it('is absent when there is no board there at all', async () => {
    // Served from GitHub Pages, /api/scores is a 404 page, not JSON.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', { status: 404 })),
    );
    await expect(fetchTop()).resolves.toBeNull();
  });
});

describe('submitting a score', () => {
  it('reports where the score landed', async () => {
    respondWith(200, { ok: true, rank: 3, top: [{ name: 'ROXY', score: 1 }] });
    await expect(submitScore(GAME)).resolves.toEqual({
      kind: 'ok',
      result: { rank: 3, top: [{ name: 'ROXY', score: 1, missions: 0, day: '' }] },
    });
  });

  it('treats a score that missed the board as a success, not a failure', async () => {
    respondWith(200, { ok: true, rank: null, top: [] });
    const outcome = await submitScore(GAME);
    expect(outcome).toEqual({ kind: 'ok', result: { rank: null, top: [] } });
  });

  it('passes the reason through so the player can read it', async () => {
    respondWith(422, { error: 'that score is too high for a game that long' });
    await expect(submitScore(GAME)).resolves.toEqual({
      kind: 'rejected',
      reason: 'that score is too high for a game that long',
    });
  });

  it('says offline rather than rejected when the request never arrived', async () => {
    failWith(new TypeError('Failed to fetch'));
    await expect(submitScore(GAME)).resolves.toEqual({ kind: 'offline' });
  });

  it('gives up rather than hanging for ever', async () => {
    // An aborted request is indistinguishable from being offline, which is the
    // right answer: a leaderboard that hangs looks like a crashed game.
    failWith(new DOMException('aborted', 'AbortError'));
    await expect(submitScore(GAME)).resolves.toEqual({ kind: 'offline' });
  });
});

describe('the remembered name', () => {
  it('round-trips', () => {
    saveName('ROXY');
    expect(loadName()).toBe('ROXY');
  });

  it('is empty before anyone has played', () => {
    expect(loadName()).toBe('');
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage);
    expect(() => saveName('ROXY')).not.toThrow();
    expect(loadName()).toBe('');
  });
});
