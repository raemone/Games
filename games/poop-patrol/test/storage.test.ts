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

  it('drops claims naming a person or a reward that does not exist', () => {
    const migrated = migrate({
      people: [{ id: 'p1', name: 'Ana' }],
      claims: [
        { personId: 'ghost', rewardId: 'screen-hour', day: '2026-09-01', cost: 100 },
        { personId: 'p1', rewardId: 'a-pony', day: '2026-09-01', cost: 100 },
        { personId: 'p1', rewardId: 'screen-hour', day: 'never', cost: 100 },
      ],
    });
    expect(migrated.claims).toEqual([]);
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

describe('migrating reward prices', () => {
  it('fills in the built-in defaults when settings say nothing', () => {
    expect(migrate({}).settings.rewardPrices).toEqual({
      'screen-hour': 100,
      'chick-fil-a': 400,
      'arcade-basement': 800,
    });
  });

  it('honours a stored override and keeps the rest at default', () => {
    const prices = migrate({ settings: { rewardPrices: { 'screen-hour': 250 } } }).settings.rewardPrices;
    expect(prices['screen-hour']).toBe(250);
    expect(prices['chick-fil-a']).toBe(400);
  });

  it('clamps and cleans what it finds', () => {
    const prices = migrate({
      settings: { rewardPrices: { 'screen-hour': -5, 'chick-fil-a': 1e9, 'arcade-basement': 'free' } },
    }).settings.rewardPrices;
    expect(prices['screen-hour']).toBe(1);
    expect(prices['chick-fil-a']).toBe(100000);
    expect(prices['arcade-basement']).toBe(800);
  });

  it('drops a price for a reward that is not for sale, or does not exist', () => {
    const prices = migrate({
      settings: { rewardPrices: { 'switch-2': 5, nonsense: 5 } },
    }).settings.rewardPrices;
    expect(prices['switch-2']).toBeUndefined();
    expect(prices['nonsense']).toBeUndefined();
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
