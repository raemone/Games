import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_VERSION,
  clear,
  defaultSave,
  exportJson,
  importJson,
  load,
  migrate,
  save,
} from '../src/core/storage';
import { MAX_NAME_LENGTH, MAX_PEOPLE, MAX_PER_DAY } from '../src/core/model';
import { installBlockedStorage, installFakeStorage, person, saveWith } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('load and save', () => {
  it('round-trips a save it wrote itself', () => {
    installFakeStorage();
    const data = saveWith([person('p1', 'Ana')], { '2026-09-01': { p1: 3 } });
    expect(save(data)).toBe(true);
    expect(load()).toEqual(data);
  });

  it('returns the default when nothing has been saved', () => {
    installFakeStorage();
    expect(load()).toEqual(defaultSave());
  });

  it('starts with an empty roster, so the app can show its setup screen', () => {
    expect(defaultSave().people).toEqual([]);
    expect(defaultSave().version).toBe(SAVE_VERSION);
  });

  it('clears', () => {
    installFakeStorage();
    save(saveWith([person('p1')], {}));
    expect(clear()).toBe(true);
    expect(load()).toEqual(defaultSave());
  });
});

describe('blocked storage', () => {
  it('never throws, and reports what it could not do', () => {
    installBlockedStorage();
    expect(() => load()).not.toThrow();
    expect(load()).toEqual(defaultSave());
    expect(save(defaultSave())).toBe(false);
    expect(clear()).toBe(false);
  });
});

describe('migrate', () => {
  it('turns junk into a usable default', () => {
    for (const junk of [null, undefined, 'nonsense', 42, [], true]) {
      expect(migrate(junk)).toEqual(defaultSave());
    }
    expect(migrate({})).toEqual(defaultSave());
  });

  it('survives unparseable text in the slot', () => {
    const store = installFakeStorage();
    store.set('poop-patrol:save', '{ not json');
    expect(load()).toEqual(defaultSave());
  });

  it('repairs a partial save rather than discarding it', () => {
    const migrated = migrate({ people: [{ id: 'p1', name: 'Ana' }] });
    expect(migrated.people).toHaveLength(1);
    expect(migrated.people[0]?.name).toBe('Ana');
    expect(migrated.settings.dogName).toBe('Roxy');
  });

  it('stamps the current version onto an older save', () => {
    expect(migrate({ version: 0, people: [] }).version).toBe(SAVE_VERSION);
  });

  it('drops day keys that are not real dates', () => {
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      log: { '2026-02-30': { p1: 1 }, garbage: { p1: 1 }, '2026-09-01': { p1: 2 } },
    });
    expect(Object.keys(migrated.log)).toEqual(['2026-09-01']);
  });

  it('drops log entries pointing at a person who no longer exists', () => {
    // A dangling id would otherwise break every lookup on the leaderboard.
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      log: { '2026-09-01': { p1: 2, ghost: 5 } },
    });
    expect(migrated.log['2026-09-01']).toEqual({ p1: 2 });
  });

  it('drops a day left empty after cleaning', () => {
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      log: { '2026-09-01': { ghost: 5 } },
    });
    expect(migrated.log).toEqual({});
  });

  it('cleans counts', () => {
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      log: {
        '2026-09-01': { p1: -3 },
        '2026-09-02': { p1: 0 },
        '2026-09-03': { p1: 2.7 },
        '2026-09-04': { p1: Number.NaN },
        '2026-09-05': { p1: 1e9 },
      },
    });
    expect(migrated.log['2026-09-01']).toBeUndefined();
    expect(migrated.log['2026-09-02']).toBeUndefined();
    expect(migrated.log['2026-09-03']).toEqual({ p1: 2 });
    expect(migrated.log['2026-09-04']).toBeUndefined();
    expect(migrated.log['2026-09-05']).toEqual({ p1: MAX_PER_DAY });
  });

  it('de-duplicates person ids, keeping the first', () => {
    const migrated = migrate({
      people: [
        { id: 'p1', name: 'Ana' },
        { id: 'p1', name: 'Impostor' },
      ],
    });
    expect(migrated.people).toHaveLength(1);
    expect(migrated.people[0]?.name).toBe('Ana');
  });

  it('repairs a counter that would hand out an id already in use', () => {
    const migrated = migrate({ people: [{ id: 'p7', name: 'Ana' }], nextPersonId: 2 });
    expect(migrated.nextPersonId).toBe(8);
  });

  it('defaults the counter to one for an empty roster', () => {
    expect(migrate({ people: [] }).nextPersonId).toBe(1);
  });

  it('truncates a roster past the maximum', () => {
    const people = Array.from({ length: MAX_PEOPLE + 5 }, (_unused, index) => ({
      id: `p${index + 1}`,
      name: `P${index}`,
    }));
    expect(migrate({ people }).people).toHaveLength(MAX_PEOPLE);
  });

  it('trims and truncates names', () => {
    const migrated = migrate({ people: [{ id: 'p1', name: `  ${'x'.repeat(40)}  ` }] });
    expect(migrated.people[0]?.name).toHaveLength(MAX_NAME_LENGTH);
  });

  it('names an unnamed person rather than leaving a blank row', () => {
    expect(migrate({ people: [{ id: 'p1' }] }).people[0]?.name).toBe('Someone');
  });

  it('falls back for an emoji or colour that is not on the list', () => {
    const migrated = migrate({ people: [{ id: 'p1', name: 'Ana', emoji: 5, color: 'chartreuse' }] });
    expect(migrated.people[0]?.emoji).toBe('🐶');
    expect(migrated.people[0]?.color).toBe('#ffd88a');
  });

  it('clamps the weekly goal and keeps the toggles', () => {
    expect(migrate({ settings: { weeklyGoal: 0 } }).settings.weeklyGoal).toBe(1);
    expect(migrate({ settings: { weeklyGoal: 9999 } }).settings.weeklyGoal).toBe(500);
    expect(migrate({ settings: { soundOn: false } }).settings.soundOn).toBe(false);
  });

  it('defaults a missing or blank dog name', () => {
    expect(migrate({ settings: {} }).settings.dogName).toBe('Roxy');
    expect(migrate({ settings: { dogName: '   ' } }).settings.dogName).toBe('Roxy');
  });

  it('ignores a log that is not an object', () => {
    expect(migrate({ people: [{ id: 'p1', name: 'Ana' }], log: [1, 2, 3] }).log).toEqual({});
  });
});

describe('migrating claims', () => {
  it('defaults an older save that has never heard of claims', () => {
    const migrated = migrate({ people: [{ id: 'p1', name: 'Ana' }], version: 1 });
    expect(migrated.claims).toEqual([]);
    expect(migrated.version).toBe(SAVE_VERSION);
  });

  it('keeps a well-formed claim', () => {
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      claims: [{ personId: 'p1', rewardId: 'screen-hour', day: '2026-09-01', cost: 100 }],
    });
    expect(migrated.claims).toEqual([
      { personId: 'p1', rewardId: 'screen-hour', day: '2026-09-01', cost: 100 },
    ]);
  });

  it('drops claims naming a person who does not exist, or a day that is not one', () => {
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      claims: [
        { personId: 'ghost', rewardId: 'screen-hour', day: '2026-09-01', cost: 100 },
        { personId: 'p1', rewardId: 'screen-hour', day: 'never', cost: 100 },
      ],
    });
    expect(migrated.claims).toEqual([]);
  });

  it('keeps a claim for a reward the family has since removed', () => {
    // Rewards are editable now, so an unknown id means "deleted", not
    // "corrupt". The points were spent; refunding them silently would be worse.
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      claims: [{ personId: 'p1', rewardId: 'a-pony', day: '2026-09-01', cost: 100 }],
    });
    expect(migrated.claims).toHaveLength(1);
  });

  it('de-duplicates a double-tapped claim', () => {
    const one = { personId: 'p1', rewardId: 'screen-hour', day: '2026-09-01', cost: 100 };
    const migrated = migrate({ people: [{ id: 'p1', name: 'Ana' }], claims: [one, { ...one }] });
    expect(migrated.claims).toHaveLength(1);
  });

  it('treats an unreadable cost as free rather than losing the record', () => {
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      claims: [{ personId: 'p1', rewardId: 'screen-hour', day: '2026-09-01', cost: 'lots' }],
    });
    expect(migrated.claims[0]).toMatchObject({ cost: 0 });
  });

  it('ignores a claims list that is not a list', () => {
    expect(migrate({ people: [{ id: 'p1', name: 'Ana' }], claims: 'nope' }).claims).toEqual([]);
  });
});

describe('migrating the reward list', () => {
  it('seeds the defaults for a save that has never had one', () => {
    const migrated = migrate({ people: [] });
    expect(migrated.rewards.map((reward) => reward.id)).toEqual([
      'screen-hour',
      'chick-fil-a',
      'arcade-basement',
      'cellphone',
      'switch-2',
    ]);
  });

  it("carries an older save's tuned prices across into the seeded list", () => {
    // Before rewards were editable, a custom price lived in settings. That
    // tuning must survive the move rather than silently resetting.
    const migrated = migrate({ settings: { rewardPrices: { 'screen-hour': 250 } } });
    expect(migrated.rewards.find((reward) => reward.id === 'screen-hour')?.price).toBe(250);
    expect(migrated.rewards.find((reward) => reward.id === 'chick-fil-a')?.price).toBe(400);
  });

  it('clamps a carried-over price', () => {
    const migrated = migrate({ settings: { rewardPrices: { 'screen-hour': -10 } } });
    expect(migrated.rewards.find((reward) => reward.id === 'screen-hour')?.price).toBe(1);
  });

  it('keeps a stored list, custom rewards and all', () => {
    const migrated = migrate({
      rewards: [
        { id: 'r1', emoji: '🍦', name: 'Ice cream', blurb: 'From the van.', kind: 'points', price: 150 },
      ],
    });
    expect(migrated.rewards).toEqual([
      {
        id: 'r1',
        emoji: '🍦',
        name: 'Ice cream',
        blurb: 'From the van.',
        kind: 'points',
        price: 150,
        streakDays: 0,
        archived: false,
      },
    ]);
  });

  it('repairs a counter that would reuse an id', () => {
    const migrated = migrate({ rewards: [{ id: 'r7', name: 'Thing', kind: 'points', price: 10 }] });
    expect(migrated.nextRewardId).toBe(8);
  });

  it('cleans what it finds', () => {
    const migrated = migrate({
      rewards: [
        { id: 'r1', name: '   ', kind: 'points', price: 1e9 },
        { id: 'r2', name: 'Streaky', kind: 'streak', streakDays: -4 },
      ],
    });
    expect(migrated.rewards[0]).toMatchObject({ name: 'A reward', price: 100000, emoji: '🎁' });
    expect(migrated.rewards[1]).toMatchObject({ kind: 'streak', streakDays: 1, price: 0 });
  });

  it('de-duplicates reward ids and caps the list', () => {
    const dupes = migrate({
      rewards: [
        { id: 'r1', name: 'One', kind: 'points', price: 10 },
        { id: 'r1', name: 'Impostor', kind: 'points', price: 10 },
      ],
    });
    expect(dupes.rewards).toHaveLength(1);
    expect(dupes.rewards[0]?.name).toBe('One');

    const many = Array.from({ length: 40 }, (_unused, index) => ({
      id: `r${String(index + 1)}`,
      name: `R${String(index)}`,
      kind: 'points',
      price: 10,
    }));
    expect(migrate({ rewards: many }).rewards).toHaveLength(20);
  });

  it('falls back to the defaults rather than leaving no shop at all', () => {
    expect(migrate({ rewards: [] }).rewards).toHaveLength(5);
    expect(migrate({ rewards: 'nonsense' }).rewards).toHaveLength(5);
    expect(migrate({ rewards: [{ nonsense: true }] }).rewards).toHaveLength(5);
  });

  it('keeps a claim whose reward is no longer in the list', () => {
    // The points were really spent. Dropping the claim would refund them.
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      rewards: [{ id: 'r1', name: 'Kept', kind: 'points', price: 10 }],
      claims: [{ personId: 'p1', rewardId: 'long-gone', day: '2026-09-01', cost: 400 }],
    });
    expect(migrated.claims).toHaveLength(1);
    expect(migrated.claims[0]?.cost).toBe(400);
  });
});

describe('export and import', () => {
  it('round-trips', () => {
    const data = saveWith([person('p1', 'Ana')], { '2026-09-01': { p1: 3 } });
    expect(importJson(exportJson(data))).toEqual(data);
  });

  it('returns null for text that is not JSON', () => {
    expect(importJson('not json at all')).toBeNull();
  });

  it('cleans an imported save the same way a loaded one is cleaned', () => {
    const imported = importJson('{"people":[{"id":"p1","name":"Ana"}],"log":{"bad":{"p1":1}}}');
    expect(imported?.log).toEqual({});
  });
});
