import { describe, expect, it } from 'vitest';
import { medalFor, weekBoard } from '../src/core/leaderboard';
import { person, saveWith } from './helpers';

const MONDAY = '2026-08-31';

describe('weekBoard', () => {
  it('orders by points, highest first', () => {
    const save = saveWith(
      [person('p1', 'Ana'), person('p2', 'Ben')],
      { '2026-09-01': { p1: 1, p2: 4 } },
    );
    expect(weekBoard(save, MONDAY).map((row) => row.person.name)).toEqual(['Ben', 'Ana']);
  });

  it('counts only the days inside that week', () => {
    const save = saveWith([person('p1')], {
      '2026-08-30': { p1: 9 }, // the Sunday before
      '2026-09-02': { p1: 2 },
      '2026-09-07': { p1: 9 }, // the Monday after
    });
    expect(weekBoard(save, MONDAY)[0]).toMatchObject({ poops: 2, daysActive: 1 });
  });

  it('marks which weekdays were active, Monday first', () => {
    const save = saveWith([person('p1')], { '2026-09-02': { p1: 1 } });
    expect(weekBoard(save, MONDAY)[0]?.days).toEqual([false, false, true, false, false, false, false]);
  });

  it('breaks a points tie on pickups', () => {
    // Ana: 1+1+1 over three days = 30 base + (0+5+10) bonus = 45.
    // Ben:  2+2  over two days   = 40 base + (0+5)    bonus = 45.
    // Level on points, so the bigger haul takes it.
    const save = saveWith([person('p1', 'Ana'), person('p2', 'Ben')], {
      '2026-09-01': { p1: 1, p2: 2 },
      '2026-09-02': { p1: 1, p2: 2 },
      '2026-09-03': { p1: 1 },
    });
    const rows = weekBoard(save, MONDAY);
    expect(rows[0]?.points).toBe(45);
    expect(rows[1]?.points).toBe(45);
    expect(rows[0]?.person.name).toBe('Ben'); // 4 pickups beats 3
  });

  it('breaks a points and pickups tie on days turned up', () => {
    // Both score 20 from 2 pickups - Ben's days are not consecutive, so he
    // earns no streak bonus either. Turning up twice wins it.
    const save = saveWith([person('p1', 'Ana'), person('p2', 'Ben')], {
      '2026-09-01': { p1: 2, p2: 1 },
      '2026-09-03': { p2: 1 },
    });
    const rows = weekBoard(save, MONDAY);
    expect(rows[0]?.points).toBe(rows[1]?.points);
    expect(rows[0]?.poops).toBe(rows[1]?.poops);
    expect(rows[0]?.person.name).toBe('Ben');
  });

  it('shares a rank on a genuine three-way tie', () => {
    const save = saveWith([person('p1'), person('p2'), person('p3')], {
      '2026-09-01': { p1: 2, p2: 2, p3: 2 },
    });
    const rows = weekBoard(save, MONDAY);
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 1]);
    expect(rows.every((row) => row.tied)).toBe(true);
    // Order is by id purely so the array is deterministic.
    expect(rows.map((row) => row.person.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('uses competition ranking, so a shared second is followed by fourth', () => {
    const save = saveWith([person('p1'), person('p2'), person('p3'), person('p4')], {
      '2026-09-01': { p1: 5, p2: 3, p3: 3, p4: 1 },
    });
    expect(weekBoard(save, MONDAY).map((row) => row.rank)).toEqual([1, 2, 2, 4]);
  });

  it('marks only the people actually tied', () => {
    const save = saveWith([person('p1'), person('p2'), person('p3')], {
      '2026-09-01': { p1: 5, p2: 3, p3: 3 },
    });
    expect(weekBoard(save, MONDAY).map((row) => row.tied)).toEqual([false, true, true]);
  });

  it('keeps people who scored nothing, ordered last', () => {
    const save = saveWith([person('p1', 'Ana'), person('p2', 'Ben')], {
      '2026-09-01': { p2: 1 },
    });
    const rows = weekBoard(save, MONDAY);
    expect(rows.map((row) => row.person.name)).toEqual(['Ben', 'Ana']);
    expect(rows[1]).toMatchObject({ points: 0, poops: 0, rank: 2 });
  });

  it('includes a retired person only if they scored that week', () => {
    const retired = { ...person('p2', 'Gran'), retired: true };

    const active = saveWith([person('p1'), retired], { '2026-09-01': { p1: 1, p2: 2 } });
    expect(active.people.length).toBe(2);
    expect(weekBoard(active, MONDAY).map((row) => row.person.id)).toContain('p2');

    const quiet = saveWith([person('p1'), retired], { '2026-09-01': { p1: 1 } });
    expect(weekBoard(quiet, MONDAY).map((row) => row.person.id)).not.toContain('p2');
  });

  it('puts a Sunday and the following Monday in different weeks', () => {
    const save = saveWith([person('p1')], { '2026-09-06': { p1: 3 }, '2026-09-07': { p1: 4 } });
    expect(weekBoard(save, MONDAY)[0]?.poops).toBe(3);
    expect(weekBoard(save, '2026-09-07')[0]?.poops).toBe(4);
  });

  it('reports the biggest single day', () => {
    const save = saveWith([person('p1')], { '2026-09-01': { p1: 2 }, '2026-09-03': { p1: 6 } });
    expect(weekBoard(save, MONDAY)[0]?.bestDay).toBe(6);
  });
});

describe('medalFor', () => {
  it('gives gold, silver and bronze, then a star for everyone else', () => {
    expect(medalFor(1, 10)).toBe('🥇');
    expect(medalFor(2, 10)).toBe('🥈');
    expect(medalFor(3, 10)).toBe('🥉');
    expect(medalFor(4, 10)).toBe('🌟');
    expect(medalFor(9, 10)).toBe('🌟');
  });

  it('gives nothing to somebody who has not scored yet', () => {
    expect(medalFor(1, 0)).toBe('');
    expect(medalFor(5, 0)).toBe('');
  });
});
