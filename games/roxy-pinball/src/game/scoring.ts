/**
 * Points, the bonus multiplier and the end-of-ball bonus.
 *
 * Two currencies, deliberately: the score, which only ever goes up, and bones,
 * which are collected during a ball and cashed in when it drains. Bones are
 * what make a ball that ends badly still feel like it was worth playing - the
 * shot you made before the drain still pays, and the multiplier decides how
 * much. Both are pure functions over a plain object, so the whole economy can
 * be checked in a test.
 */

export type LaneLetter = 'r' | 'o' | 'x' | 'y';

export const LANE_LETTERS: readonly LaneLetter[] = ['r', 'o', 'x', 'y'];

/** What each feature of the table pays, before any multiplier. */
export const AWARDS = {
  slingshot: 250,
  bumper: 1_200,
  spinner: 800,
  lane: 3_000,
  laneSet: 30_000,
  drop: 5_000,
  dropBank: 60_000,
  squirrel: 3_000,
  doghouse: 20_000,
  orbit: 15_000,
  /** Shooting the doghouse in the six seconds after a launch. */
  skillShot: 200_000,
  jackpot: 500_000,
  superJackpot: 2_000_000,
} as const;

/** Bones collected per feature, cashed in at the end of the ball. */
export const BONES = {
  bumper: 1,
  spinner: 1,
  lane: 3,
  drop: 4,
  squirrel: 3,
  doghouse: 8,
  orbit: 6,
  missionShot: 10,
} as const;

export const BONE_VALUE = 6_000;
export const MAX_MULTIPLIER = 8;

/** Both are one-offs per game, and both are reachable in an ordinary game. */
export const EXTRA_BALL_SCORE = 5_000_000;
export const EXTRA_BALL_MISSIONS = 3;

export interface ScoreState {
  readonly score: number;
  /** Bonus units held for this ball only. */
  readonly bones: number;
  readonly multiplier: number;
  readonly lanes: Readonly<Record<LaneLetter, boolean>>;
  readonly extraBalls: number;
}

export function initialScore(): ScoreState {
  return {
    score: 0,
    bones: 0,
    multiplier: 1,
    lanes: { r: false, o: false, x: false, y: false },
    extraBalls: 0,
  };
}

export function award(state: ScoreState, points: number, bones = 0): ScoreState {
  return { ...state, score: state.score + Math.round(points), bones: state.bones + bones };
}

export interface LaneResult {
  readonly state: ScoreState;
  /** True when this rollover finished the R-O-X-Y set. */
  readonly completedSet: boolean;
  /** True when it was a letter the player already had - still worth points. */
  readonly repeat: boolean;
}

/**
 * Roll over one of the four top lanes. Completing R-O-X-Y clears the set and
 * steps the bonus multiplier up, which is the classic reason to keep plunging
 * into the top of the table rather than only working the lower playfield.
 */
export function rolloverLane(state: ScoreState, letter: LaneLetter): LaneResult {
  const repeat = state.lanes[letter];
  const lanes = { ...state.lanes, [letter]: true };
  const complete = LANE_LETTERS.every((key) => lanes[key]);

  const scored = award(state, AWARDS.lane + (complete ? AWARDS.laneSet : 0), BONES.lane);
  if (!complete) {
    return { state: { ...scored, lanes }, completedSet: false, repeat };
  }
  return {
    state: {
      ...scored,
      lanes: { r: false, o: false, x: false, y: false },
      multiplier: Math.min(MAX_MULTIPLIER, state.multiplier + 1),
    },
    completedSet: true,
    repeat,
  };
}

/** What the bones in hand are worth right now. */
export function bonusValue(state: ScoreState): number {
  return state.bones * BONE_VALUE * state.multiplier;
}

/**
 * Cash the bonus in and start the next ball. The multiplier goes with it: it is
 * earned per ball, which is what stops the last ball of a long game being worth
 * more than the first three put together.
 */
export function collectBonus(state: ScoreState): ScoreState {
  return {
    ...state,
    score: state.score + bonusValue(state),
    bones: 0,
    multiplier: 1,
    lanes: { r: false, o: false, x: false, y: false },
  };
}

/**
 * Whether this game has earned an extra ball it has not been given yet, either
 * by score or by finishing three missions.
 */
export function earnedExtraBall(state: ScoreState, missionsCompleted: number): boolean {
  const earned =
    (state.score >= EXTRA_BALL_SCORE ? 1 : 0) +
    (missionsCompleted >= EXTRA_BALL_MISSIONS ? 1 : 0);
  return earned > state.extraBalls;
}

export function grantExtraBall(state: ScoreState): ScoreState {
  return { ...state, extraBalls: state.extraBalls + 1 };
}

/** 1,234,567 reads as 1,234,567 on a phone only if it is grouped. */
export function formatScore(score: number): string {
  return Math.round(score).toLocaleString('en-US');
}
