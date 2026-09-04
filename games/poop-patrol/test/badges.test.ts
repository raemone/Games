import { describe, expect, it } from 'vitest';
import { BADGES, earnedBadgeIds, newlyEarned } from '../src/core/badges';
import { addDays } from '../src/core/dates';
import type { Log } from '../src/core/model';
import { logFor, person, saveWith } from './helpers';

const TODAY = '2026-09-04';

function earned(log: Log, today = TODAY, weeklyGoal = 25): ReadonlySet<string> {
  return earnedBadgeIds(saveWith([person('p1')], log, weeklyGoal), 'p1', today);
}

/** `count` consecutive days ending at `end`, one pickup each. */
function run(end: string, count: number, perDay = 1): Log {
  const days: Record<string, number> = {};
  for (let offset = 0; offset < count; offset += 1) days[addDays(end, -offset)] = perDay;
  return logFor('p1', days);
}

describe('badge definitions', () => {
  it('has unique ids', () => {
    expect(new Set(BADGES.map((badge) => badge.id)).size).toBe(BADGES.length);
  });

  it('gives every badge a name, an emoji and a blurb', () => {
    for (const badge of BADGES) {
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.emoji.length).toBeGreaterThan(0);
      expect(badge.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('thresholds', () => {
  it('grants nothing on an empty log', () => {
    expect(earned({})).toEqual(new Set());
  });

  it('grants First Flush on the very first pickup', () => {
    expect(earned(logFor('p1', { [TODAY]: 1 }))).toContain('first-flush');
  });

  it('grants the single-day badges at exactly their threshold', () => {
    const cases: readonly (readonly [number, string])[] = [
      [2, 'double-doody'],
      [3, 'hat-trick'],
      [5, 'scoop-troop'],
      [10, 'mount-poopmore'],
    ];
    for (const [threshold, id] of cases) {
      expect(earned(logFor('p1', { [TODAY]: threshold - 1 }))).not.toContain(id);
      expect(earned(logFor('p1', { [TODAY]: threshold }))).toContain(id);
    }
  });

  it('grants the streak badges at exactly their threshold', () => {
    const cases: readonly (readonly [number, string])[] = [
      [2, 'two-in-a-row'],
      [7, 'week-warrior'],
      [14, 'fortnight-flinger'],
      [30, 'monthly-marvel'],
    ];
    for (const [threshold, id] of cases) {
      expect(earned(run(TODAY, threshold - 1))).not.toContain(id);
      expect(earned(run(TODAY, threshold))).toContain(id);
    }
  });

  it('grants the career badges at exactly their threshold', () => {
    expect(earned(logFor('p1', { [TODAY]: 99 }))).not.toContain('century-club');
    // 99 yesterday plus 1 today is 100 pickups without exceeding the daily cap.
    const hundred = logFor('p1', { '2026-09-03': 99, [TODAY]: 1 });
    expect(earned(hundred)).toContain('century-club');
    expect(earned(hundred)).not.toContain('double-century');

    const twoHundred = logFor('p1', {
      '2026-09-01': 99,
      '2026-09-02': 99,
      '2026-09-03': 1,
      [TODAY]: 1,
    });
    expect(earned(twoHundred)).toContain('double-century');
  });

  it('grants Steady Scooper only for a full Monday-to-Sunday week', () => {
    // 2026-08-31 is a Monday; six of its days is not enough.
    expect(earned(run('2026-09-05', 6), '2026-09-06')).not.toContain('steady-scooper');
    expect(earned(run('2026-09-06', 7), '2026-09-06')).toContain('steady-scooper');
  });

  it('grants Weekend Warrior only when both weekend days are covered', () => {
    expect(earned(logFor('p1', { '2026-09-05': 1 }), '2026-09-06')).not.toContain('weekend-warrior');
    expect(earned(logFor('p1', { '2026-09-05': 1, '2026-09-06': 1 }), '2026-09-06')).toContain(
      'weekend-warrior',
    );
  });

  it('grants Monday Motivator on the fourth Monday', () => {
    const threeMondays = logFor('p1', { '2026-08-10': 1, '2026-08-17': 1, '2026-08-24': 1 });
    expect(earned(threeMondays)).not.toContain('monday-motivator');

    const fourMondays = logFor('p1', {
      '2026-08-10': 1,
      '2026-08-17': 1,
      '2026-08-24': 1,
      '2026-08-31': 1,
    });
    expect(earned(fourMondays)).toContain('monday-motivator');
  });

  it('grants Rain or Shine in the third distinct week', () => {
    expect(earned(logFor('p1', { '2026-08-18': 1, '2026-08-25': 1 }))).not.toContain('rain-or-shine');
    expect(earned(logFor('p1', { '2026-08-18': 1, '2026-08-25': 1, '2026-09-01': 1 }))).toContain(
      'rain-or-shine',
    );
  });

  it('grants Clean Sweep when the family met the goal in a week you were active', () => {
    const log = logFor('p1', { '2026-09-01': 5 });
    expect(earned(log, TODAY, 10)).not.toContain('clean-sweep');
    expect(earned(log, TODAY, 5)).toContain('clean-sweep');
  });

  it('grants Comeback Kid for a three-day run after a week away', () => {
    const shortGap = logFor('p1', {
      '2026-09-01': 1,
      '2026-09-02': 1,
      '2026-09-03': 1,
      [TODAY]: 1,
    });
    expect(earned(shortGap)).not.toContain('comeback-kid');

    const longGap = logFor('p1', {
      '2026-08-20': 1,
      '2026-09-02': 1,
      '2026-09-03': 1,
      [TODAY]: 1,
    });
    expect(earned(longGap)).toContain('comeback-kid');
  });

  it('grants Personal Best only once there is an earlier week to beat', () => {
    const firstWeekOnly = logFor('p1', { '2026-09-01': 5 });
    expect(earned(firstWeekOnly)).not.toContain('personal-best');

    const beatsIt = logFor('p1', { '2026-08-25': 1, '2026-09-01': 5 });
    expect(earned(beatsIt)).toContain('personal-best');

    const doesNot = logFor('p1', { '2026-08-25': 9, '2026-09-01': 1 });
    expect(earned(doesNot)).not.toContain('personal-best');
  });
});

describe('earnedBadgeIds', () => {
  it('is idempotent', () => {
    const log = run(TODAY, 3);
    expect(earned(log)).toEqual(earned(log));
  });

  it('ignores days after today', () => {
    const log = logFor('p1', { '2026-09-20': 10 });
    expect(earned(log)).toEqual(new Set());
  });

  it('scores each person separately', () => {
    const save = saveWith([person('p1'), person('p2')], { [TODAY]: { p1: 5 } });
    expect(earnedBadgeIds(save, 'p1', TODAY)).toContain('scoop-troop');
    expect(earnedBadgeIds(save, 'p2', TODAY)).toEqual(new Set());
  });

  it('grants a streak badge retroactively when a gap is backfilled', () => {
    const gappy = logFor('p1', { '2026-09-02': 1, [TODAY]: 1 });
    expect(earned(gappy)).not.toContain('two-in-a-row');

    const filled = logFor('p1', { '2026-09-02': 1, '2026-09-03': 1, [TODAY]: 1 });
    expect(earned(filled)).toContain('two-in-a-row');
  });
});

describe('newlyEarned', () => {
  it('returns only the additions, in BADGES order', () => {
    const before = earned(logFor('p1', { [TODAY]: 1 }));
    const after = earned(logFor('p1', { [TODAY]: 3 }));
    expect(newlyEarned(before, after).map((badge) => badge.id)).toEqual(['double-doody', 'hat-trick']);
  });

  it('returns nothing when nothing changed', () => {
    const badges = earned(logFor('p1', { [TODAY]: 1 }));
    expect(newlyEarned(badges, badges)).toEqual([]);
  });

  it('never reports a badge that was lost', () => {
    const before = earned(logFor('p1', { [TODAY]: 3 }));
    const after = earned(logFor('p1', { [TODAY]: 1 }));
    expect(newlyEarned(before, after)).toEqual([]);
  });
});
