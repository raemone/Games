import { describe, expect, it } from 'vitest';
import { bestStreak, streakFor, streakLengthOn } from '../src/core/streaks';
import { logFor } from './helpers';

const TODAY = '2026-09-04';

describe('streakFor', () => {
  it('is active when today is logged', () => {
    const log = logFor('p1', { '2026-09-02': 1, '2026-09-03': 1, '2026-09-04': 2 });
    expect(streakFor(log, 'p1', TODAY)).toMatchObject({ length: 3, status: 'active', lastDay: TODAY });
  });

  it('stays alive when only yesterday is logged', () => {
    // The rule that matters: nothing logged today yet must not wipe a streak
    // out at 07:00, before anyone has had a chance to defend it.
    const log = logFor('p1', { '2026-09-03': 1 });
    expect(streakFor(log, 'p1', TODAY)).toMatchObject({
      length: 1,
      status: 'atRisk',
      lastDay: '2026-09-03',
    });
  });

  it('keeps the full length of a run that ended yesterday', () => {
    const log = logFor('p1', { '2026-09-01': 1, '2026-09-02': 1, '2026-09-03': 1 });
    expect(streakFor(log, 'p1', TODAY)).toMatchObject({ length: 3, status: 'atRisk' });
  });

  it('is broken once two days have passed', () => {
    const log = logFor('p1', { '2026-09-01': 1, '2026-09-02': 3 });
    expect(streakFor(log, 'p1', TODAY)).toMatchObject({
      length: 0,
      status: 'none',
      lastDay: '2026-09-02',
    });
  });

  it('reports nothing at all for an empty log', () => {
    expect(streakFor({}, 'p1', TODAY)).toEqual({ length: 0, status: 'none', best: 0, lastDay: null });
  });

  it('ignores another person entirely', () => {
    const log = logFor('p2', { '2026-09-04': 5 });
    expect(streakFor(log, 'p1', TODAY)).toMatchObject({ length: 0, status: 'none' });
  });

  it('rejoins two runs when the gap is backfilled', () => {
    const broken = logFor('p1', { '2026-09-01': 1, '2026-09-02': 1, '2026-09-04': 1 });
    expect(streakFor(broken, 'p1', TODAY).length).toBe(1);

    const repaired = logFor('p1', {
      '2026-09-01': 1,
      '2026-09-02': 1,
      '2026-09-03': 1,
      '2026-09-04': 1,
    });
    expect(streakFor(repaired, 'p1', TODAY).length).toBe(4);
  });

  it('counts each day once across the 23-hour spring-forward day', () => {
    const log = logFor('p1', { '2026-03-07': 1, '2026-03-08': 1, '2026-03-09': 1 });
    expect(streakFor(log, 'p1', '2026-03-09')).toMatchObject({ length: 3, status: 'active' });
  });

  it('counts each day once across the 25-hour fall-back day', () => {
    const log = logFor('p1', { '2026-10-31': 1, '2026-11-01': 1, '2026-11-02': 1 });
    expect(streakFor(log, 'p1', '2026-11-02')).toMatchObject({ length: 3, status: 'active' });
  });

  it('ignores days after today, so a fast clock cannot manufacture a streak', () => {
    const log = logFor('p1', { '2026-09-04': 1, '2026-09-05': 1, '2026-09-06': 1 });
    expect(streakFor(log, 'p1', TODAY)).toMatchObject({ length: 1, status: 'active', best: 1 });
  });
});

describe('bestStreak', () => {
  it('finds the longest historical run even when the current one is over', () => {
    const log = logFor('p1', {
      '2026-08-01': 1,
      '2026-08-02': 1,
      '2026-08-03': 1,
      '2026-08-04': 1,
      '2026-08-20': 1,
    });
    expect(bestStreak(log, 'p1', TODAY)).toBe(4);
    expect(streakFor(log, 'p1', TODAY).length).toBe(0);
    expect(streakFor(log, 'p1', TODAY).best).toBe(4);
  });

  it('is zero with no history', () => {
    expect(bestStreak({}, 'p1', TODAY)).toBe(0);
  });

  it('ignores future days', () => {
    const log = logFor('p1', { '2026-09-05': 1, '2026-09-06': 1, '2026-09-07': 1 });
    expect(bestStreak(log, 'p1', TODAY)).toBe(0);
  });
});

describe('streakLengthOn', () => {
  it('is zero on a day with nothing logged', () => {
    const log = logFor('p1', { '2026-09-02': 1 });
    expect(streakLengthOn(log, 'p1', '2026-09-03')).toBe(0);
  });

  it('is the run length ending at that day, ignoring anything later', () => {
    const log = logFor('p1', {
      '2026-09-01': 1,
      '2026-09-02': 1,
      '2026-09-03': 1,
      '2026-09-04': 1,
    });
    expect(streakLengthOn(log, 'p1', '2026-09-02')).toBe(2);
    expect(streakLengthOn(log, 'p1', '2026-09-04')).toBe(4);
  });
});
