/**
 * Scoring and the bone economy.
 *
 * Bones are Sonic's rings: getting hit scatters them instead of killing you,
 * which is the mercy mechanic that keeps an eight-year-old playing rather than
 * rage-quitting. Everything here is pure so the rules are easy to test.
 */

export const SCORE = {
  bone: 10,
  /** Bonus per second left on the clock when the goal is reached. */
  timeBonusPerSecond: 20,
  /** Each unspent bone is worth this at the goal. */
  boneBonus: 10,
  /** Bopping enemies in one airborne chain pays progressively more. */
  comboChain: [100, 200, 500, 1000] as const,
  /** Every chain hit past the table is worth this. */
  comboMax: 1000,
  extraLifeEvery: 100,
  startingLives: 3,
  /** How many bones actually bounce free when you are hit. */
  maxScattered: 20,
} as const;

export interface Run {
  score: number;
  bones: number;
  lives: number;
  /** Enemies bopped without touching the ground, used for the combo chain. */
  chain: number;
  /** Bones collected across the whole run, for the extra-life counter. */
  lifetimeBones: number;
  /** Milliseconds elapsed in the current level. */
  elapsedMs: number;
}

export function createRun(): Run {
  return {
    score: 0,
    bones: 0,
    lives: SCORE.startingLives,
    chain: 0,
    lifetimeBones: 0,
    elapsedMs: 0,
  };
}

/** Collect one bone. Returns true when it earned an extra life. */
export function collectBone(run: Run): boolean {
  const before = Math.floor(run.lifetimeBones / SCORE.extraLifeEvery);
  run.bones += 1;
  run.lifetimeBones += 1;
  run.score += SCORE.bone;
  const after = Math.floor(run.lifetimeBones / SCORE.extraLifeEvery);
  if (after <= before) return false;
  run.lives += 1;
  return true;
}

/** Bop an enemy. Returns the points awarded so the game can show them. */
export function bopEnemy(run: Run): number {
  const index = Math.min(run.chain, SCORE.comboChain.length - 1);
  const points = run.chain >= SCORE.comboChain.length ? SCORE.comboMax : SCORE.comboChain[index]!;
  run.chain += 1;
  run.score += points;
  return points;
}

/** Landing on the ground ends an airborne combo chain. */
export function resetChain(run: Run): void {
  run.chain = 0;
}

export interface HitResult {
  /** How many bones bounced free. Zero means Roxy had none and lost a life. */
  readonly scattered: number;
  readonly lostLife: boolean;
  readonly gameOver: boolean;
}

/** Take a hit: drop the bones, or lose a life when there are none left. */
export function takeHit(run: Run): HitResult {
  run.chain = 0;

  if (run.bones > 0) {
    const scattered = Math.min(run.bones, SCORE.maxScattered);
    run.bones = 0;
    return { scattered, lostLife: false, gameOver: false };
  }

  run.lives -= 1;
  return { scattered: 0, lostLife: true, gameOver: run.lives <= 0 };
}

export interface GoalBonus {
  readonly timeBonus: number;
  readonly boneBonus: number;
  readonly total: number;
}

/** Work out the end-of-level bonus. Overrunning the clock simply pays nothing. */
export function goalBonus(run: Run, timeLimitMs: number): GoalBonus {
  const remainingMs = Math.max(0, timeLimitMs - run.elapsedMs);
  const timeBonus = Math.floor(remainingMs / 1000) * SCORE.timeBonusPerSecond;
  const boneBonus = run.bones * SCORE.boneBonus;
  return { timeBonus, boneBonus, total: timeBonus + boneBonus };
}

/** Apply the goal bonus to the run and return the totals that were shown. */
export function finishLevel(run: Run, timeLimitMs: number): GoalBonus {
  const bonus = goalBonus(run, timeLimitMs);
  run.score += bonus.total;
  return bonus;
}

/** Reset the per-life state after a death, keeping score and lives. */
export function respawn(run: Run): void {
  run.bones = 0;
  run.chain = 0;
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatScore(score: number): string {
  return score.toString().padStart(6, '0');
}
