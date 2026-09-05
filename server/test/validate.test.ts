import { describe, expect, it } from 'vitest';
import { MAX_SCORE, MIN_TIME_MS, normalizeInitials, parseLimit, parseSubmission } from '../src/validate';

const GOOD = {
  levelId: 'w1-1',
  playerId: '0123456789abcdef',
  initials: 'ROX',
  score: 4200,
  timeMs: 61_000,
};

describe('parseSubmission', () => {
  it('accepts a plausible run', () => {
    const parsed = parseSubmission(GOOD);
    expect(parsed).toEqual({ ok: true, value: GOOD });
  });

  it.each([
    ['not an object', 'null', null],
    ['a level nobody can play', 'unknown levelId', { ...GOOD, levelId: 'w9-9' }],
    ['a player id that is not 16 hex', 'playerId', { ...GOOD, playerId: 'roxy' }],
    ['blank initials', 'initials', { ...GOOD, initials: '   ' }],
    ['a fractional score', 'score', { ...GOOD, score: 12.5 }],
    ['a negative score', 'score', { ...GOOD, score: -1 }],
    ['an impossible score', 'score', { ...GOOD, score: MAX_SCORE + 1 }],
    ['a time no one could run', 'timeMs', { ...GOOD, timeMs: MIN_TIME_MS - 1 }],
    ['a time past the level limit', 'timeMs', { ...GOOD, timeMs: 420_001 }],
  ])('rejects %s', (_label, expected, payload) => {
    const parsed = parseSubmission(payload);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(expected === 'null' ? 'JSON object' : expected);
  });

  it('holds each level to its own clock', () => {
    // w3-3 allows 480s, w1-1 only 420s. The same run is fine on one, not the other.
    expect(parseSubmission({ ...GOOD, timeMs: 470_000 }).ok).toBe(false);
    expect(parseSubmission({ ...GOOD, levelId: 'w3-3', timeMs: 470_000 }).ok).toBe(true);
  });

  it('stores the cleaned-up initials, not what was sent', () => {
    const parsed = parseSubmission({ ...GOOD, initials: ' r o x y ' });
    expect(parsed.ok && parsed.value.initials).toBe('ROX');
  });
});

describe('normalizeInitials', () => {
  it('uppercases, strips punctuation and trims to three', () => {
    expect(normalizeInitials('ab')).toBe('AB');
    expect(normalizeInitials('roxy!')).toBe('ROX');
    expect(normalizeInitials('a-1')).toBe('A1');
  });

  it('rejects what is left of nothing', () => {
    expect(normalizeInitials('')).toBeNull();
    expect(normalizeInitials('!!!')).toBeNull();
    expect(normalizeInitials(42)).toBeNull();
  });

  it('keeps the obvious rudeness off a board a child reads', () => {
    expect(normalizeInitials('ass')).toBeNull();
    expect(normalizeInitials('a.s.s')).toBeNull();
  });
});

describe('parseLimit', () => {
  it('defaults, floors and caps', () => {
    expect(parseLimit(null)).toBe(10);
    expect(parseLimit('junk')).toBe(10);
    expect(parseLimit('3')).toBe(3);
    expect(parseLimit('0')).toBe(1);
    expect(parseLimit('999')).toBe(50);
  });
});
