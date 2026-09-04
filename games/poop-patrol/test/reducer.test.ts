import { describe, expect, it } from 'vitest';
import { reduce } from '../src/core/reducer';
import { MAX_PEOPLE, MAX_PER_DAY, PERSON_COLORS, PERSON_EMOJI, defaultSettings } from '../src/core/model';
import { deepFreeze, person, saveWith } from './helpers';

const TODAY = '2026-09-04';
const base = (): ReturnType<typeof saveWith> =>
  saveWith([person('p1', 'Ana'), person('p2', 'Ben')], {});

describe('adjustCount', () => {
  it('creates the day and the person key on the first pickup', () => {
    const next = reduce(base(), { kind: 'adjustCount', day: TODAY, personId: 'p1', delta: 1 }, TODAY);
    expect(next.log).toEqual({ [TODAY]: { p1: 1 } });
  });

  it('will not go below zero, and creates no key doing so', () => {
    const next = reduce(base(), { kind: 'adjustCount', day: TODAY, personId: 'p1', delta: -1 }, TODAY);
    expect(next.log).toEqual({});
    expect(TODAY in next.log).toBe(false);
  });

  it('removes the person key when their count reaches zero', () => {
    const save = saveWith([person('p1'), person('p2')], { [TODAY]: { p1: 1, p2: 2 } });
    const next = reduce(save, { kind: 'adjustCount', day: TODAY, personId: 'p1', delta: -1 }, TODAY);
    expect(next.log).toEqual({ [TODAY]: { p2: 2 } });
  });

  it('removes the whole day when the last person leaves it', () => {
    const save = saveWith([person('p1')], { [TODAY]: { p1: 1 } });
    const next = reduce(save, { kind: 'adjustCount', day: TODAY, personId: 'p1', delta: -1 }, TODAY);
    expect(next.log).toEqual({});
    expect(Object.keys(next.log)).toHaveLength(0);
  });

  it('backfills an earlier day without touching today', () => {
    const save = saveWith([person('p1')], { [TODAY]: { p1: 1 } });
    const next = reduce(
      save,
      { kind: 'adjustCount', day: '2026-09-01', personId: 'p1', delta: 2 },
      TODAY,
    );
    expect(next.log).toEqual({ '2026-09-01': { p1: 2 }, [TODAY]: { p1: 1 } });
  });
});

describe('setCount', () => {
  it('clamps to the daily maximum', () => {
    const next = reduce(base(), { kind: 'setCount', day: TODAY, personId: 'p1', count: 5000 }, TODAY);
    expect(next.log[TODAY]?.p1).toBe(MAX_PER_DAY);
  });

  it('floors a fractional count', () => {
    const next = reduce(base(), { kind: 'setCount', day: TODAY, personId: 'p1', count: 2.7 }, TODAY);
    expect(next.log[TODAY]?.p1).toBe(2);
  });

  it('treats a negative count as zero', () => {
    const save = saveWith([person('p1')], { [TODAY]: { p1: 3 } });
    const next = reduce(save, { kind: 'setCount', day: TODAY, personId: 'p1', count: -4 }, TODAY);
    expect(next.log).toEqual({});
  });
});

describe('guards', () => {
  it('refuses a day after today, so a fast clock cannot invent a streak', () => {
    const save = base();
    const next = reduce(
      save,
      { kind: 'adjustCount', day: '2026-09-05', personId: 'p1', delta: 1 },
      TODAY,
    );
    expect(next).toBe(save); // provably a no-op
  });

  it('ignores an unknown person', () => {
    const save = base();
    expect(reduce(save, { kind: 'adjustCount', day: TODAY, personId: 'nobody', delta: 1 }, TODAY)).toBe(
      save,
    );
  });

  it('never mutates the save it was given', () => {
    const save = deepFreeze(saveWith([person('p1')], { [TODAY]: { p1: 1 } }));
    expect(() =>
      reduce(save, { kind: 'adjustCount', day: TODAY, personId: 'p1', delta: 1 }, TODAY),
    ).not.toThrow();
    expect(save.log[TODAY]?.p1).toBe(1);
  });
});

describe('addPerson', () => {
  it('assigns sequential ids and trims the name', () => {
    let save = saveWith([], {});
    save = reduce(save, { kind: 'addPerson', name: '  Ana  ', emoji: '🦊', color: '#7ec8f0' }, TODAY);
    save = reduce(save, { kind: 'addPerson', name: 'Ben', emoji: '🐱', color: '#8ce0a8' }, TODAY);
    expect(save.people.map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(save.people[0]?.name).toBe('Ana');
    expect(save.nextPersonId).toBe(3);
  });

  it('refuses a blank name', () => {
    const save = saveWith([], {});
    expect(reduce(save, { kind: 'addPerson', name: '   ', emoji: '🦊', color: '#7ec8f0' }, TODAY)).toBe(
      save,
    );
  });

  it('falls back for an emoji or colour that is not on the list', () => {
    const save = reduce(saveWith([], {}), { kind: 'addPerson', name: 'Ana', emoji: '💣', color: 'red' }, TODAY);
    expect(PERSON_EMOJI).toContain(save.people[0]?.emoji);
    expect(PERSON_COLORS).toContain(save.people[0]?.color);
  });

  it('stops at the maximum roster size', () => {
    let save = saveWith([], {});
    for (let index = 0; index < MAX_PEOPLE + 3; index += 1) {
      save = reduce(save, { kind: 'addPerson', name: `P${index}`, emoji: '🐶', color: '#ffd88a' }, TODAY);
    }
    expect(save.people).toHaveLength(MAX_PEOPLE);
  });
});

describe('editPerson', () => {
  it('renames and restyles', () => {
    const next = reduce(
      base(),
      { kind: 'editPerson', personId: 'p1', name: 'Anastasia', emoji: '🦄', color: '#c9a4ff' },
      TODAY,
    );
    expect(next.people[0]).toMatchObject({ name: 'Anastasia', emoji: '🦄', color: '#c9a4ff' });
  });

  it('ignores an unknown person', () => {
    const save = base();
    expect(
      reduce(save, { kind: 'editPerson', personId: 'nope', name: 'X', emoji: '🦄', color: '#c9a4ff' }, TODAY),
    ).toBe(save);
  });
});

describe('retirePerson', () => {
  it('sets the flag and leaves every log entry alone', () => {
    const save = saveWith([person('p1'), person('p2')], { [TODAY]: { p1: 2, p2: 1 } });
    const next = reduce(save, { kind: 'retirePerson', personId: 'p1', retired: true }, TODAY);
    expect(next.people[0]?.retired).toBe(true);
    expect(next.log).toEqual(save.log);
  });

  it('can bring somebody back', () => {
    const save = saveWith([{ ...person('p1'), retired: true }], {});
    expect(reduce(save, { kind: 'retirePerson', personId: 'p1', retired: false }, TODAY).people[0]?.retired).toBe(
      false,
    );
  });
});

describe('deletePerson', () => {
  it('removes the person and purges their history', () => {
    const save = saveWith([person('p1'), person('p2')], {
      '2026-09-01': { p1: 1, p2: 2 },
      '2026-09-02': { p1: 3 },
    });
    const next = reduce(save, { kind: 'deletePerson', personId: 'p1' }, TODAY);
    expect(next.people.map((entry) => entry.id)).toEqual(['p2']);
    // The day that only held p1 is gone; the shared day keeps p2's count.
    expect(next.log).toEqual({ '2026-09-01': { p2: 2 } });
  });

  it('never reuses the id afterwards', () => {
    let save = saveWith([], {});
    save = reduce(save, { kind: 'addPerson', name: 'Ana', emoji: '🐶', color: '#ffd88a' }, TODAY);
    save = reduce(save, { kind: 'deletePerson', personId: 'p1' }, TODAY);
    save = reduce(save, { kind: 'addPerson', name: 'Ben', emoji: '🐶', color: '#ffd88a' }, TODAY);
    expect(save.people[0]?.id).toBe('p2');
  });

  it('ignores an unknown person', () => {
    const save = base();
    expect(reduce(save, { kind: 'deletePerson', personId: 'nope' }, TODAY)).toBe(save);
  });
});

describe('setSettings', () => {
  it('clamps the weekly goal', () => {
    const next = reduce(
      base(),
      { kind: 'setSettings', settings: { ...defaultSettings(), weeklyGoal: 9999 } },
      TODAY,
    );
    expect(next.settings.weeklyGoal).toBe(500);
  });

  it('keeps the old dog name rather than accepting a blank one', () => {
    const next = reduce(
      base(),
      { kind: 'setSettings', settings: { ...defaultSettings(), dogName: '   ' } },
      TODAY,
    );
    expect(next.settings.dogName).toBe('Roxy');
  });

  it('stores the toggles', () => {
    const next = reduce(
      base(),
      { kind: 'setSettings', settings: { ...defaultSettings(), soundOn: false, confettiOn: false } },
      TODAY,
    );
    expect(next.settings).toMatchObject({ soundOn: false, confettiOn: false });
  });
});

describe('undo through setCount', () => {
  it('restores a count that did not exist before', () => {
    const save = saveWith([person('p1')], {});
    const added = reduce(save, { kind: 'adjustCount', day: TODAY, personId: 'p1', delta: 1 }, TODAY);
    const undone = reduce(added, { kind: 'setCount', day: TODAY, personId: 'p1', count: 0 }, TODAY);
    expect(undone.log).toEqual(save.log);
  });

  it('restores a previous non-zero count', () => {
    const save = saveWith([person('p1')], { [TODAY]: { p1: 4 } });
    const changed = reduce(save, { kind: 'setCount', day: TODAY, personId: 'p1', count: 9 }, TODAY);
    const undone = reduce(changed, { kind: 'setCount', day: TODAY, personId: 'p1', count: 4 }, TODAY);
    expect(undone.log).toEqual(save.log);
  });
});
