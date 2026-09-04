import { describe, expect, it } from 'vitest';
import {
  POINTS_PER_POOP,
  careerPoints,
  careerPoops,
  dayPoints,
  familyGoalProgress,
  familyWeekTotal,
  scoreDay,
  streakBonus,
} from '../src/core/scoring';
import { logFor } from './helpers';

describe('streakBonus', () => {
  it('follows the published table', () => {
    const table = [0, 0, 5, 10, 15, 20, 25, 25, 25];
    table.forEach((expected, streakDay) => {
      expect(streakBonus(streakDay)).toBe(expected);
    });
  });

  it('never grows past the cap', () => {
    expect(streakBonus(50)).toBe(25);
  });
});

describe('dayPoints', () => {
  it('is ten a poop plus the bonus', () => {
    expect(POINTS_PER_POOP).toBe(10);
    expect(dayPoints(3, 1)).toBe(30);
    expect(dayPoints(3, 4)).toBe(45);
  });

  it('is nothing at all for a day with no pickups', () => {
    expect(dayPoints(0, 9)).toBe(0);
  });
});

describe('scoreDay', () => {
  it('uses the streak as it stood on that day', () => {
    const log = logFor('p1', { '2026-09-01': 1, '2026-09-02': 2, '2026-09-03': 1 });
    expect(scoreDay(log, 'p1', '2026-09-01')).toMatchObject({ streakDay: 1, points: 10 });
    expect(scoreDay(log, 'p1', '2026-09-02')).toMatchObject({ streakDay: 2, points: 25 });
    expect(scoreDay(log, 'p1', '2026-09-03')).toMatchObject({ streakDay: 3, points: 20 });
  });

  it('does not change a past day when a later day is logged', () => {
    const before = logFor('p1', { '2026-09-01': 1, '2026-09-02': 2 });
    const tuesday = scoreDay(before, 'p1', '2026-09-02').points;

    const after = logFor('p1', { '2026-09-01': 1, '2026-09-02': 2, '2026-09-03': 4 });
    expect(scoreDay(after, 'p1', '2026-09-02').points).toBe(tuesday);
  });

  it('reports zero for a day with nothing logged', () => {
    expect(scoreDay({}, 'p1', '2026-09-02')).toMatchObject({
      count: 0,
      streakDay: 0,
      basePoints: 0,
      bonusPoints: 0,
      points: 0,
    });
  });
});

describe('career totals', () => {
  it('adds up points and pickups across every day', () => {
    const log = logFor('p1', { '2026-09-01': 2, '2026-09-02': 1 });
    expect(careerPoops(log, 'p1')).toBe(3);
    // 20 on day one, then 10 + 5 on day two.
    expect(careerPoints(log, 'p1')).toBe(35);
  });

  it('is zero for somebody with no history', () => {
    expect(careerPoops({}, 'p1')).toBe(0);
    expect(careerPoints({}, 'p1')).toBe(0);
  });
});

describe('familyWeekTotal', () => {
  it('counts everybody across Monday to Sunday', () => {
    const log = {
      '2026-08-31': { p1: 2, p2: 1 },
      '2026-09-06': { p1: 3 },
    };
    expect(familyWeekTotal(log, '2026-08-31')).toBe(6);
  });

  it('excludes the Sunday before and the Monday after', () => {
    const log = {
      '2026-08-30': { p1: 5 }, // the Sunday before
      '2026-09-01': { p1: 1 },
      '2026-09-07': { p1: 9 }, // the Monday after
    };
    expect(familyWeekTotal(log, '2026-08-31')).toBe(1);
  });
});

describe('familyGoalProgress', () => {
  it('reports the fraction of the goal picked up', () => {
    const log = { '2026-09-01': { p1: 5 } };
    expect(familyGoalProgress(log, '2026-08-31', 10)).toEqual({
      picked: 5,
      goal: 10,
      fraction: 0.5,
      met: false,
    });
  });

  it('flips to met exactly at the goal', () => {
    const log = { '2026-09-01': { p1: 10 } };
    expect(familyGoalProgress(log, '2026-08-31', 10).met).toBe(true);
  });

  it('clamps the fraction at one when the goal is beaten', () => {
    const log = { '2026-09-01': { p1: 40 } };
    expect(familyGoalProgress(log, '2026-08-31', 10).fraction).toBe(1);
  });

  it('does not divide by zero for a goal of zero', () => {
    const progress = familyGoalProgress({}, '2026-08-31', 0);
    expect(Number.isFinite(progress.fraction)).toBe(true);
    expect(progress.goal).toBe(1);
  });
});
