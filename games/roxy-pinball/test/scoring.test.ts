import { describe, expect, it } from 'vitest';
import {
  AWARDS,
  BONE_VALUE,
  EXTRA_BALL_MISSIONS,
  EXTRA_BALL_SCORE,
  LANE_LETTERS,
  MAX_MULTIPLIER,
  award,
  bonusValue,
  collectBonus,
  earnedExtraBall,
  formatScore,
  grantExtraBall,
  initialScore,
  rolloverLane,
} from '../src/game/scoring';
import type { ScoreState } from '../src/game/scoring';

function completeLanes(state: ScoreState, times = 1): ScoreState {
  let next = state;
  for (let i = 0; i < times; i++) {
    for (const letter of LANE_LETTERS) next = rolloverLane(next, letter).state;
  }
  return next;
}

describe('the top lanes', () => {
  it('steps the multiplier up when R-O-X-Y is finished, and clears the set', () => {
    const state = completeLanes(initialScore());
    expect(state.multiplier).toBe(2);
    expect(LANE_LETTERS.every((letter) => !state.lanes[letter])).toBe(true);
    expect(state.score).toBe(AWARDS.lane * 4 + AWARDS.laneSet);
  });

  it('pays for a letter the player already has, without a second set', () => {
    const once = rolloverLane(initialScore(), 'r');
    const twice = rolloverLane(once.state, 'r');
    expect(twice.repeat).toBe(true);
    expect(twice.completedSet).toBe(false);
    expect(twice.state.score).toBe(AWARDS.lane * 2);
  });

  it('stops the multiplier at its cap rather than growing for ever', () => {
    const state = completeLanes(initialScore(), MAX_MULTIPLIER + 4);
    expect(state.multiplier).toBe(MAX_MULTIPLIER);
  });
});

describe('the end-of-ball bonus', () => {
  it('is bones times the multiplier, and is what the multiplier is for', () => {
    const state = completeLanes(award(initialScore(), 0, 10));
    // Four lane rollovers add their own bones on top of the ten.
    expect(bonusValue(state)).toBe(state.bones * BONE_VALUE * 2);
  });

  it('cashes in and resets the ball-long state, but never the score', () => {
    const before = award(initialScore(), 1000, 12);
    const after = collectBonus(before);
    expect(after.score).toBe(1000 + 12 * BONE_VALUE);
    expect(after.bones).toBe(0);
    expect(after.multiplier).toBe(1);
    // The bonus is earned per ball. Keeping the multiplier would make the last
    // ball of a long game worth more than the first three put together.
    expect(collectBonus(after).score).toBe(after.score);
  });
});

describe('extra balls', () => {
  it('is owed one for the score, and only one', () => {
    const rich = award(initialScore(), EXTRA_BALL_SCORE, 0);
    expect(earnedExtraBall(rich, 0)).toBe(true);
    expect(earnedExtraBall(grantExtraBall(rich), 0)).toBe(false);
  });

  it('is owed one for finishing three missions', () => {
    expect(earnedExtraBall(initialScore(), EXTRA_BALL_MISSIONS - 1)).toBe(false);
    expect(earnedExtraBall(initialScore(), EXTRA_BALL_MISSIONS)).toBe(true);
  });

  it('gives both to a player who earned both', () => {
    let state = award(initialScore(), EXTRA_BALL_SCORE, 0);
    expect(earnedExtraBall(state, EXTRA_BALL_MISSIONS)).toBe(true);
    state = grantExtraBall(state);
    expect(earnedExtraBall(state, EXTRA_BALL_MISSIONS)).toBe(true);
    state = grantExtraBall(state);
    expect(earnedExtraBall(state, EXTRA_BALL_MISSIONS)).toBe(false);
  });
});

describe('formatScore', () => {
  it('groups the digits, because seven of them in a row are unreadable', () => {
    expect(formatScore(1234567)).toBe('1,234,567');
    expect(formatScore(0)).toBe('0');
  });

  it('rounds, so a fractional mission award never shows a decimal point', () => {
    expect(formatScore(1500.4)).toBe('1,500');
  });
});
