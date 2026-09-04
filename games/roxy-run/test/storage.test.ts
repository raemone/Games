import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, defaultSave, load, migrate, recordResult, save } from '../src/engine/storage';

/** A minimal localStorage stand-in; the real one is not present under Node. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
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
    const original = recordResult(defaultSave(), 'w1-1', 4200, 51_000, 30, 2);
    expect(migrate(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it('falls back to defaults for junk', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate('nonsense')).toEqual(defaultSave());
    expect(migrate(42)).toEqual(defaultSave());
  });

  it('repairs a partially written save rather than discarding it', () => {
    const result = migrate({ unlockedWorld: 3, levels: { 'w1-1': { bestScore: 900 } } });
    expect(result.unlockedWorld).toBe(3);
    expect(result.levels['w1-1']).toEqual({ bestScore: 900, bestTimeMs: 0, completed: false });
    expect(result.settings).toEqual(defaultSave().settings);
  });

  it('rejects impossible values instead of trusting them', () => {
    const result = migrate({
      unlockedWorld: -5,
      totalBones: Number.NaN,
      levels: { bad: 'not an object' },
    });
    expect(result.unlockedWorld).toBe(1);
    expect(result.totalBones).toBe(0);
    expect(result.levels.bad).toBeUndefined();
  });

  it('stamps the current version onto an older save', () => {
    expect(migrate({ version: 0 }).version).toBe(SAVE_VERSION);
  });
});

describe('load and save', () => {
  it('round-trips through storage', () => {
    const data = recordResult(defaultSave(), 'w2-3', 12_000, 44_000, 60, 3);
    expect(save(data)).toBe(true);
    expect(load()).toEqual(data);
  });

  it('returns a default save when nothing is stored', () => {
    expect(load()).toEqual(defaultSave());
  });

  it('survives corrupt JSON in the slot', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'roxy-run:save': '{ not json' }));
    expect(load()).toEqual(defaultSave());
  });

  it('survives storage being unavailable entirely', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    } as unknown as Storage);
    expect(load()).toEqual(defaultSave());
    expect(save(defaultSave())).toBe(false);
  });
});

describe('recordResult', () => {
  it('keeps the higher score and the lower time', () => {
    let data = recordResult(defaultSave(), 'w1-1', 1000, 60_000, 10, 1);
    data = recordResult(data, 'w1-1', 500, 45_000, 5, 1);
    expect(data.levels['w1-1']?.bestScore).toBe(1000);
    expect(data.levels['w1-1']?.bestTimeMs).toBe(45_000);
  });

  it('takes the first completion time rather than treating zero as a record', () => {
    const data = recordResult(defaultSave(), 'w1-1', 100, 88_000, 1, 1);
    expect(data.levels['w1-1']?.bestTimeMs).toBe(88_000);
    expect(data.levels['w1-1']?.completed).toBe(true);
  });

  it('never re-locks a world that was already unlocked', () => {
    let data = recordResult(defaultSave(), 'w3-1', 10, 10_000, 0, 3);
    data = recordResult(data, 'w1-1', 10, 10_000, 0, 1);
    expect(data.unlockedWorld).toBe(3);
  });

  it('accumulates bones across levels', () => {
    let data = recordResult(defaultSave(), 'w1-1', 0, 1000, 25, 1);
    data = recordResult(data, 'w1-2', 0, 1000, 15, 1);
    expect(data.totalBones).toBe(40);
  });
});
