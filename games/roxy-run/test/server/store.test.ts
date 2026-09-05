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
