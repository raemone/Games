import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, bestFirst } from '../../server/store';

const entry = (playerId: string, score: number, timeMs: number, initials = 'AAA') => ({
  playerId,
  initials,
  score,
  timeMs,
});

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
});

describe('submit', () => {
  it('keeps the best score and the best time, even from different runs', async () => {
    await store.submit('w1-1', entry('a'.repeat(16), 5000, 90_000));
    await store.submit('w1-1', entry('a'.repeat(16), 3000, 60_000));

    const [top] = await store.top('w1-1', 10);
    expect(top?.score).toBe(5000);
    expect(top?.timeMs).toBe(60_000);
  });

  it('never lets a worse run overwrite a better one', async () => {
    await store.submit('w1-1', entry('a'.repeat(16), 5000, 60_000));
    await store.submit('w1-1', entry('a'.repeat(16), 10, 400_000));

    expect((await store.top('w1-1', 10))[0]).toMatchObject({ score: 5000, timeMs: 60_000 });
  });

  it('gives each level its own board', async () => {
    await store.submit('w1-1', entry('a'.repeat(16), 5000, 60_000));
    expect(await store.count('w1-1')).toBe(1);
    expect(await store.count('w1-2')).toBe(0);
  });

  it('takes the newest initials for a returning player', async () => {
    await store.submit('w1-1', entry('a'.repeat(16), 100, 60_000, 'ROX'));
    await store.submit('w1-1', entry('a'.repeat(16), 200, 60_000, 'RAE'));
    expect((await store.top('w1-1', 10))[0]?.initials).toBe('RAE');
  });
});

describe('ordering', () => {
  it('puts the higher score first and breaks a tie on time', () => {
    expect(bestFirst(entry('a', 100, 10), entry('b', 90, 10))).toBeLessThan(0);
    expect(bestFirst(entry('a', 100, 90_000), entry('b', 100, 60_000))).toBeGreaterThan(0);
  });

  it('ranks players and finds one outside the page', async () => {
    for (let i = 0; i < 12; i++) {
      await store.submit('w1-1', entry(String(i).padStart(16, '0'), 1000 - i * 10, 60_000));
    }

    const top = await store.top('w1-1', 10);
    expect(top).toHaveLength(10);
    expect(top[0]?.score).toBe(1000);

    const last = await store.standing('w1-1', String(11).padStart(16, '0'));
    expect(last?.rank).toBe(12);
  });

  it('has no standing for a player who never posted', async () => {
    expect(await store.standing('w1-1', 'f'.repeat(16))).toBeNull();
  });
});

describe('the overall board', () => {
  const LEVELS = ['w1-1', 'w1-2', 'w1-3'];

  it('adds a player\'s best score on every level together', async () => {
    await store.submit('w1-1', entry('a'.repeat(16), 100, 60_000, 'ROX'));
    await store.submit('w1-2', entry('a'.repeat(16), 250, 60_000, 'ROX'));

    const board = await store.overall(LEVELS, null, 10);
    expect(board.entries).toEqual([
      { playerId: 'a'.repeat(16), initials: 'ROX', score: 350, levels: 2 },
    ]);
    expect(board.players).toBe(1);
  });

  it('counts a level once however many times it was played', async () => {
    // Only the best run on a level is stored, so a level can never contribute
    // twice - but this is the sum that would quietly double if it did.
    await store.submit('w1-1', entry('a'.repeat(16), 100, 60_000));
    await store.submit('w1-1', entry('a'.repeat(16), 900, 60_000));

    expect((await store.overall(LEVELS, null, 10)).entries[0]).toMatchObject({ score: 900, levels: 1 });
  });

  it('puts the bigger total first, and breaks a tie on levels played', async () => {
    await store.submit('w1-1', entry('a'.repeat(16), 300, 60_000, 'ONE'));
    await store.submit('w1-1', entry('b'.repeat(16), 150, 60_000, 'TWO'));
    await store.submit('w1-2', entry('b'.repeat(16), 150, 60_000, 'TWO'));

    // Same 300 apiece: the player who spread it over two levels is ahead.
    expect((await store.overall(LEVELS, null, 10)).entries.map((e) => e.initials)).toEqual(['TWO', 'ONE']);
  });

  it('ignores levels it was not asked about', async () => {
    await store.submit('w1-1', entry('a'.repeat(16), 100, 60_000));
    await store.submit('w3-3', entry('a'.repeat(16), 500, 60_000));

    expect((await store.overall(LEVELS, null, 10)).entries[0]).toMatchObject({ score: 100, levels: 1 });
  });

  it('reports where one player stands, even off the end of the page', async () => {
    for (let i = 0; i < 6; i++) {
      await store.submit('w1-1', entry(String(i).repeat(16), 100 - i, 60_000));
    }

    const board = await store.overall(LEVELS, '5'.repeat(16), 3);
    expect(board.entries).toHaveLength(3);
    expect(board.players).toBe(6);
    expect(board.you?.rank).toBe(6);
  });

  it('has no standing for a player who has posted nothing', async () => {
    await store.submit('w1-1', entry('a'.repeat(16), 100, 60_000));
    expect((await store.overall(LEVELS, 'f'.repeat(16), 10)).you).toBeNull();
  });

  it('is empty rather than broken before anyone plays', async () => {
    expect(await store.overall(LEVELS, 'f'.repeat(16), 10)).toEqual({
      entries: [],
      players: 0,
      you: null,
    });
  });
});

describe('rate limiting', () => {
  it('allows up to the limit and then refuses', async () => {
    expect(await store.allow('ip', 2, 60)).toBe(true);
    expect(await store.allow('ip', 2, 60)).toBe(true);
    expect(await store.allow('ip', 2, 60)).toBe(false);
  });

  it('counts each caller separately', async () => {
    expect(await store.allow('one', 1, 60)).toBe(true);
    expect(await store.allow('two', 1, 60)).toBe(true);
  });
});
