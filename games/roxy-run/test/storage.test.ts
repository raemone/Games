import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_VERSION,
  type SaveData,
  cleanInitials,
  clear,
  withInitials,
  defaultSave,
  load,
  migrate,
  newPlayerId,
  recordResult,
  save,
} from '../src/engine/storage';

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

/**
 * Every default save mints a fresh player id, so two of them are never equal.
 * Blanking it is what lets these tests keep asserting on the whole shape; the
 * id has its own tests below.
 */
function withoutId(data: SaveData): SaveData {
  return { ...data, playerId: '' };
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
    expect(withoutId(migrate(null))).toEqual(withoutId(defaultSave()));
    expect(withoutId(migrate('nonsense'))).toEqual(withoutId(defaultSave()));
    expect(withoutId(migrate(42))).toEqual(withoutId(defaultSave()));
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

describe('the world board identity', () => {
  it('mints a player id the server would accept', () => {
    expect(newPlayerId()).toMatch(/^[0-9a-f]{16}$/);
    expect(defaultSave().playerId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives each device its own id', () => {
    expect(newPlayerId()).not.toBe(newPlayerId());
  });

  it('keeps the id a returning player already had', () => {
    const id = 'a1b2c3d4e5f60718';
    expect(migrate({ playerId: id }).playerId).toBe(id);
  });

  it('replaces an id the server would reject', () => {
    // A version 1 save has no id at all, and a tampered one may have nonsense.
    expect(migrate({}).playerId).toMatch(/^[0-9a-f]{16}$/);
    expect(migrate({ playerId: 'ROXY' }).playerId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('starts with no initials and nothing shared', () => {
    const fresh = defaultSave();
    expect(fresh.initials).toBe('');
    expect(fresh.settings.share).toBe('ask');
  });

  it('only remembers a sharing choice that was actually made', () => {
    expect(migrate({ settings: { share: 'yes' } }).settings.share).toBe('yes');
    expect(migrate({ settings: { share: 'no' } }).settings.share).toBe('no');
    expect(migrate({ settings: { share: 'maybe' } }).settings.share).toBe('ask');
    expect(migrate({ settings: {} }).settings.share).toBe('ask');
  });

  it('gives each set of initials its own player', () => {
    // The bug: one id per device meant a second child's initials renamed every
    // score the first had posted, because every score is stored under the id.
    const rae = withInitials(defaultSave(), 'RAE');
    const max = withInitials(rae, 'MAX');

    expect(max.initials).toBe('MAX');
    expect(max.playerId).not.toBe(rae.playerId);
    // RAE's id survives, so the runs posted under it keep RAE's name.
    expect(max.players.RAE).toBe(rae.playerId);
    expect(max.players.MAX).toBe(max.playerId);
  });

  it('hands the tablet back to a player who had it before', () => {
    const rae = withInitials(defaultSave(), 'RAE');
    const max = withInitials(rae, 'MAX');
    const backToRae = withInitials(max, 'RAE');

    // Same id as the first time, so this run adds to RAE's scores rather than
    // starting a third player who happens to share the name.
    expect(backToRae.playerId).toBe(rae.playerId);
    expect(Object.keys(backToRae.players).sort()).toEqual(['MAX', 'RAE']);
  });

  it('gives the first player the id the device started with', () => {
    // Nothing has been posted before initials are chosen, so the starting id
    // belongs to nobody yet and the first player may as well keep it.
    const fresh = defaultSave();
    expect(withInitials(fresh, 'RAE').playerId).toBe(fresh.playerId);
  });

  it('survives a save written before players were separate', () => {
    // A version 2 save has one id and one set of initials. That pairing is the
    // first player; losing it would orphan every score already on the board.
    const old = { playerId: 'a1b2c3d4e5f60718', initials: 'ROX' };
    const upgraded = migrate(old);

    expect(upgraded.players).toEqual({ ROX: 'a1b2c3d4e5f60718' });
    expect(withInitials(upgraded, 'ROX').playerId).toBe('a1b2c3d4e5f60718');
    expect(withInitials(upgraded, 'RAE').playerId).not.toBe('a1b2c3d4e5f60718');
  });

  it('keeps the roster through a save and load', () => {
    const two = withInitials(withInitials(defaultSave(), 'RAE'), 'MAX');
    expect(save(two)).toBe(true);
    expect(load()).toEqual(two);
  });

  it('drops junk out of the roster rather than trusting it', () => {
    const result = migrate({
      players: { RAE: 'a1b2c3d4e5f60718', MAX: 'not-an-id', '': 'b1b2c3d4e5f60718', 5: 7 },
    });
    expect(result.players).toEqual({ RAE: 'a1b2c3d4e5f60718' });
  });

  it('ignores initials that clean away to nothing', () => {
    const before = withInitials(defaultSave(), 'RAE');
    expect(withInitials(before, '!!!')).toBe(before);
  });

  it('cleans initials to what the board can show', () => {
    expect(cleanInitials('rox')).toBe('ROX');
    expect(cleanInitials('roxy the dog')).toBe('ROX');
    expect(cleanInitials('a-1!')).toBe('A1');
    expect(cleanInitials(undefined)).toBe('');
    expect(migrate({ initials: 'r o x y' }).initials).toBe('ROX');
  });
});

describe('load and save', () => {
  it('round-trips through storage', () => {
    const data = recordResult(defaultSave(), 'w2-3', 12_000, 44_000, 60, 3);
    expect(save(data)).toBe(true);
    expect(load()).toEqual(data);
  });

  it('returns a default save when nothing is stored', () => {
    expect(withoutId(load())).toEqual(withoutId(defaultSave()));
  });

  it('survives corrupt JSON in the slot', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'roxy-run:save': '{ not json' }));
    expect(withoutId(load())).toEqual(withoutId(defaultSave()));
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
    expect(withoutId(load())).toEqual(withoutId(defaultSave()));
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

describe('clear', () => {
  it('wipes progress so the next load is a fresh start', () => {
    save(recordResult(defaultSave(), 'w3-3', 9000, 30_000, 100, 3));
    expect(withoutId(load())).not.toEqual(withoutId(defaultSave()));

    expect(clear()).toBe(true);
    expect(withoutId(load())).toEqual(withoutId(defaultSave()));
  });

  it('reports failure rather than throwing when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      removeItem() {
        throw new Error('blocked');
      },
    } as unknown as Storage);
    expect(clear()).toBe(false);
  });
});
