import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDays,
  dayKey,
  diffDays,
  epochDay,
  fromEpochDay,
  isDayKey,
  lastNDays,
  parseDayKey,
  startOfWeek,
  weekDays,
  weekdayIndex,
} from '../src/core/dates';

// vite.config.ts pins TZ to America/New_York, so anything that leans on UTC
// shows up here rather than in the backyard.

describe('dayKey', () => {
  it('uses local components, not UTC', () => {
    // 20:00 in New York is already tomorrow in UTC.
    const evening = new Date(2026, 8, 4, 20, 0, 0);
    expect(dayKey(evening)).toBe('2026-09-04');
    expect(evening.toISOString().slice(0, 10)).toBe('2026-09-05');
  });

  it('pads months and days', () => {
    expect(dayKey(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05');
  });

  it('handles the last minute of a year', () => {
    expect(dayKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe('round trips', () => {
  it('survives 400 consecutive days spanning a leap day, two DST shifts and a year boundary', () => {
    const start = epochDay('2024-02-01');
    for (let offset = 0; offset < 400; offset += 1) {
      const key = fromEpochDay(start + offset);
      expect(epochDay(key)).toBe(start + offset);
      expect(dayKey(parseDayKey(key))).toBe(key);
      expect(isDayKey(key)).toBe(true);
    }
  });
});

describe('addDays', () => {
  it('crosses month boundaries in both directions', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('handles the non-leap century', () => {
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
  });

  it('is the identity for a delta of zero', () => {
    expect(addDays('2026-09-04', 0)).toBe('2026-09-04');
  });
});

describe('DST', () => {
  it('counts the 23-hour spring-forward day as exactly one day', () => {
    // America/New_York springs forward on 2026-03-08.
    expect(diffDays('2026-03-07', '2026-03-08')).toBe(1);
    expect(diffDays('2026-03-08', '2026-03-09')).toBe(1);
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
  });

  it('counts the 25-hour fall-back day as exactly one day', () => {
    // America/New_York falls back on 2026-11-01.
    expect(diffDays('2026-10-31', '2026-11-01')).toBe(1);
    expect(diffDays('2026-11-01', '2026-11-02')).toBe(1);
  });

  it('keeps the right day for a local time that does not exist', () => {
    // 02:30 does not exist on spring-forward morning; JS normalises it
    // forward to 03:30, which is still the same date.
    expect(dayKey(new Date(2026, 2, 8, 2, 30))).toBe('2026-03-08');
  });

  it('keeps the right day for both passes of a repeated local hour', () => {
    expect(dayKey(new Date(2026, 10, 1, 1, 30))).toBe('2026-11-01');
  });
});

describe('diffDays', () => {
  it('is zero for the same day', () => {
    expect(diffDays('2026-09-04', '2026-09-04')).toBe(0);
  });

  it('is signed and antisymmetric', () => {
    expect(diffDays('2026-09-01', '2026-09-04')).toBe(3);
    expect(diffDays('2026-09-04', '2026-09-01')).toBe(-3);
  });

  it('spans a year', () => {
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(diffDays('2024-01-01', '2025-01-01')).toBe(366);
  });
});

describe('compareDays', () => {
  it('orders keys chronologically', () => {
    const keys = ['2026-09-10', '2026-01-02', '2025-12-31'];
    expect([...keys].sort(compareDays)).toEqual(['2025-12-31', '2026-01-02', '2026-09-10']);
  });
});

describe('lastNDays', () => {
  it('returns `count` ascending keys ending at `end`', () => {
    expect(lastNDays('2026-09-04', 3)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);
  });

  it('returns nothing for a non-positive count', () => {
    expect(lastNDays('2026-09-04', 0)).toEqual([]);
    expect(lastNDays('2026-09-04', -5)).toEqual([]);
  });

  it('crosses a month boundary', () => {
    expect(lastNDays('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });
});

describe('weekdayIndex', () => {
  it('is 0 for Monday and 6 for Sunday', () => {
    expect(weekdayIndex('2026-08-31')).toBe(0); // a Monday
    expect(weekdayIndex('2026-09-06')).toBe(6); // the Sunday after
  });

  it('agrees with Date.getDay() across 400 days', () => {
    const start = epochDay('2024-02-01');
    for (let offset = 0; offset < 400; offset += 1) {
      const key = fromEpochDay(start + offset);
      const expected = (parseDayKey(key).getDay() + 6) % 7;
      expect(weekdayIndex(key)).toBe(expected);
    }
  });

  it('stays in range before 1970', () => {
    expect(weekdayIndex('1965-07-04')).toBeGreaterThanOrEqual(0);
    expect(weekdayIndex('1965-07-04')).toBeLessThan(7);
  });
});

describe('startOfWeek', () => {
  it('is the identity on a Monday', () => {
    expect(startOfWeek('2026-08-31')).toBe('2026-08-31');
  });

  it('returns the preceding Monday for a Sunday, not the next one', () => {
    expect(startOfWeek('2026-09-06')).toBe('2026-08-31');
  });

  it('maps every day of one week to the same Monday', () => {
    const monday = '2026-08-31';
    for (let offset = 0; offset < 7; offset += 1) {
      expect(startOfWeek(addDays(monday, offset))).toBe(monday);
    }
  });

  it('handles a week that spans two years', () => {
    // 2026-01-01 is a Thursday.
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29');
  });
});

describe('weekDays', () => {
  it('returns seven ascending keys starting at the given Monday', () => {
    expect(weekDays('2026-08-31')).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
  });
});

describe('isDayKey', () => {
  it('accepts a real date', () => {
    expect(isDayKey('2026-09-04')).toBe(true);
    expect(isDayKey('2024-02-29')).toBe(true);
  });

  it('rejects dates that do not exist', () => {
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('2026-00-10')).toBe(false);
    expect(isDayKey('2025-02-29')).toBe(false);
  });

  it('rejects the wrong shape', () => {
    expect(isDayKey('26-1-1')).toBe(false);
    expect(isDayKey('2026-9-4')).toBe(false);
    expect(isDayKey('2026-09-04T00:00:00Z')).toBe(false);
    expect(isDayKey('today')).toBe(false);
    expect(isDayKey('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isDayKey(20260904)).toBe(false);
    expect(isDayKey(null)).toBe(false);
    expect(isDayKey(undefined)).toBe(false);
    expect(isDayKey({})).toBe(false);
    expect(isDayKey(['2026-09-04'])).toBe(false);
  });
});
