import { describe, expect, it } from 'vitest';
import {
  SCORE,
  bopEnemy,
  collectBone,
  createRun,
  finishLevel,
  formatScore,
  formatTime,
  goalBonus,
  resetChain,
  takeHit,
} from '../src/game/scoring';

describe('bones', () => {
  it('pays out per bone', () => {
    const run = createRun();
    collectBone(run);
    collectBone(run);
    expect(run.bones).toBe(2);
    expect(run.score).toBe(2 * SCORE.bone);
  });

  it('grants an extra life on every hundredth bone and not in between', () => {
    const run = createRun();
    let lives = 0;
    for (let i = 1; i <= 250; i++) {
      if (collectBone(run)) lives++;
    }
    expect(lives).toBe(2);
    expect(run.lives).toBe(SCORE.startingLives + 2);
  });

  it('counts extra lives across a whole run, not per level', () => {
    const run = createRun();
    for (let i = 0; i < 99; i++) collectBone(run);
    takeHit(run); // loses the 99 held bones but not the lifetime count
    expect(run.bones).toBe(0);
    expect(collectBone(run)).toBe(true);
  });
});

describe('enemy combo chain', () => {
  it('escalates while airborne', () => {
    const run = createRun();
    expect(bopEnemy(run)).toBe(100);
    expect(bopEnemy(run)).toBe(200);
    expect(bopEnemy(run)).toBe(500);
    expect(bopEnemy(run)).toBe(1000);
  });

  it('caps rather than growing forever', () => {
    const run = createRun();
    for (let i = 0; i < 4; i++) bopEnemy(run);
    expect(bopEnemy(run)).toBe(SCORE.comboMax);
    expect(bopEnemy(run)).toBe(SCORE.comboMax);
  });

  it('starts over after landing', () => {
    const run = createRun();
    bopEnemy(run);
    bopEnemy(run);
    resetChain(run);
    expect(bopEnemy(run)).toBe(100);
  });
});

describe('taking a hit', () => {
  it('scatters bones instead of costing a life', () => {
    const run = createRun();
    for (let i = 0; i < 5; i++) collectBone(run);
    const result = takeHit(run);
    expect(result.scattered).toBe(5);
    expect(result.lostLife).toBe(false);
    expect(run.bones).toBe(0);
    expect(run.lives).toBe(SCORE.startingLives);
  });

  it('only scatters a handful when the player is carrying a hoard', () => {
    const run = createRun();
    for (let i = 0; i < 80; i++) collectBone(run);
    expect(takeHit(run).scattered).toBe(SCORE.maxScattered);
  });

  it('costs a life with no bones in hand', () => {
    const run = createRun();
    const result = takeHit(run);
    expect(result.lostLife).toBe(true);
    expect(result.gameOver).toBe(false);
    expect(run.lives).toBe(SCORE.startingLives - 1);
  });

  it('is game over on the last life', () => {
    const run = createRun();
    takeHit(run);
    takeHit(run);
    expect(takeHit(run).gameOver).toBe(true);
  });

  it('keeps the score earned so far', () => {
    const run = createRun();
    for (let i = 0; i < 3; i++) collectBone(run);
    const scored = run.score;
    takeHit(run);
    expect(run.score).toBe(scored);
  });
});

describe('finishing a level', () => {
  it('pays for time left and bones held', () => {
    const run = createRun();
    for (let i = 0; i < 4; i++) collectBone(run);
    run.elapsedMs = 30_000;

    const bonus = goalBonus(run, 120_000);
    expect(bonus.timeBonus).toBe(90 * SCORE.timeBonusPerSecond);
    expect(bonus.boneBonus).toBe(4 * SCORE.boneBonus);
    expect(bonus.total).toBe(bonus.timeBonus + bonus.boneBonus);
  });

  it('pays more the faster the level is finished', () => {
    // The point of the clock: two identical runs, one twice as quick, and the
    // quick one is worth the difference in seconds at twenty points each.
    const quick = createRun();
    quick.elapsedMs = 60_000;
    const slow = createRun();
    slow.elapsedMs = 180_000;

    const quickBonus = goalBonus(quick, 420_000).total;
    const slowBonus = goalBonus(slow, 420_000).total;

    expect(quickBonus).toBeGreaterThan(slowBonus);
    expect(quickBonus - slowBonus).toBe(120 * SCORE.timeBonusPerSecond);
  });

  it('pays no time bonus when the clock ran out, rather than going negative', () => {
    const run = createRun();
    run.elapsedMs = 200_000;
    expect(goalBonus(run, 120_000).timeBonus).toBe(0);
  });

  it('adds the bonus to the score', () => {
    const run = createRun();
    run.elapsedMs = 60_000;
    const before = run.score;
    const bonus = finishLevel(run, 120_000);
    expect(run.score).toBe(before + bonus.total);
  });
});

describe('formatting', () => {
  it('shows time as minutes and padded seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9_000)).toBe('0:09');
    expect(formatTime(65_000)).toBe('1:05');
    expect(formatTime(-500)).toBe('0:00');
  });

  it('pads the score to six digits', () => {
    expect(formatScore(0)).toBe('000000');
    expect(formatScore(1250)).toBe('001250');
  });
});
