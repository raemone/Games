import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HIGH_SCORE_SLOTS,
  clear,
  defaultSave,
  load,
  migrate,
  rankOf,
  recordGame,
  save,
  today,
} from '../src/engine/storage';

/** A minimal localStorage stand-in; the real one is not present under Node. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

describe('migrate', () => {
  it('accepts a save it wrote itself', () => {
    const original = recordGame(defaultSave(), 4_200_000, ['fetch', 'bath'], '2026-01-02');
    expect(migrate(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it('falls back to defaults for junk', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate('nonsense')).toEqual(defaultSave());
    expect(migrate({ highScores: 'lots' })).toEqual(defaultSave());
  });

  it('drops entries it cannot make sense of rather than the whole table', () => {
    const migrated = migrate({
      highScores: [{ score: 900 }, null, { score: 'big' }, { score: 5, missions: 1, day: 'x' }],
    });
    expect(migrated.highScores.map((entry) => entry.score)).toEqual([900, 5]);
  });
});

describe('load and save', () => {
  it('round-trips through storage', () => {
    const data = recordGame(defaultSave(), 1_000_000, ['dinner'], today());
    expect(save(data)).toBe(true);
    expect(load()).toEqual(data);
  });

  it('returns a playable default when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage);
    expect(load()).toEqual(defaultSave());
    expect(save(defaultSave())).toBe(false);
    expect(clear()).toBe(false);
  });
});

describe('the high score table', () => {
  it('sorts by score and keeps only as many as it shows', () => {
    let data = defaultSave();
    for (const score of [100, 900, 300, 700, 500, 200, 800]) {
      data = recordGame(data, score, [], '2026-01-01');
    }
    expect(data.highScores).toHaveLength(HIGH_SCORE_SLOTS);
    expect(data.highScores.map((entry) => entry.score)).toEqual([900, 800, 700, 500, 300]);
    expect(data.gamesPlayed).toBe(7);
  });

  it('keeps the older run ahead on a tie', () => {
    let data = recordGame(defaultSave(), 500, ['fetch'], '2026-01-01');
    data = recordGame(data, 500, ['bath'], '2026-01-02');
    expect(data.highScores[0]?.day).toBe('2026-01-01');
  });

  it('remembers every mission ever finished, without repeats', () => {
    let data = recordGame(defaultSave(), 10, ['fetch', 'bath'], '2026-01-01');
    data = recordGame(data, 20, ['bath', 'bone'], '2026-01-02');
    expect([...data.missionsSeen].sort()).toEqual(['bath', 'bone', 'fetch']);
  });

  it('does not record a game that scored nothing', () => {
    expect(recordGame(defaultSave(), 0, [], '2026-01-01').highScores).toEqual([]);
  });
});

describe('rankOf', () => {
  it('says where a score would land, or that it would not', () => {
    let data = defaultSave();
    for (const score of [900, 800, 700, 600, 500]) data = recordGame(data, score, [], '2026-01-01');
    expect(rankOf(data, 1000)).toBe(0);
    expect(rankOf(data, 750)).toBe(2);
    expect(rankOf(data, 100)).toBe(-1);
    expect(rankOf(data, 0)).toBe(-1);
  });

  it('has room for anything at all while the table is short', () => {
    expect(rankOf(defaultSave(), 1)).toBe(0);
  });
});

describe('today', () => {
  it('uses the local calendar date, not UTC', () => {
    // Late on the last day of the year, west of UTC, the UTC date is already
    // the next year - and a score logged on New Year's Eve should say so.
    expect(today(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
    expect(today(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });
});
