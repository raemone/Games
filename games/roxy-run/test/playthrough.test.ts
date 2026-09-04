import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { parseLevel } from '../src/game/level';
import { findFloor, isWallAt } from '../src/game/collision';
import { createRun } from '../src/game/scoring';
import { PHYS } from '../src/game/physics';
import { Session } from '../src/game/session';
import { themeForWorld } from '../src/game/theme';
import type { Audio } from '../src/engine/audio';

/** Session only ever calls play(); a no-op stands in for the real synth. */
const SILENT = { play: () => {} } as unknown as Audio;

interface Result {
  readonly session: Session;
  readonly ticks: number;
}

/**
 * A deliberately dim bot: run right, and jump when something is in the way.
 *
 * If this can finish a level then the level is passable, the collision is not
 * trapping anyone in geometry, and nothing is unreachable. It is a far better
 * check than eyeballing a screenshot, and it runs on every commit.
 */
function playthrough(levelIndex: number, maxTicks: number): Result {
  const def = LEVELS[levelIndex]!;
  const level = parseLevel(def);
  const session = new Session(level, themeForWorld(def.world), createRun(), SILENT);

  let lastX = session.body.x;
  let stuckFor = 0;

  for (let tick = 0; tick < maxTicks; tick++) {
    const body = session.body;

    // Look a stride ahead for a missing floor or a wall.
    const probeX = body.x + body.widthRadius + 10;
    const noFloorAhead = !findFloor(level.map, probeX, body.y + body.heightRadius, 24);
    const wallAhead = isWallAt(level.map, probeX, body.y - 4);
    const obstacleAhead = session.entities.some(
      (e) =>
        !e.taken &&
        (e.kind === 'spike' || e.kind === 'crate' || e.kind === 'walker') &&
        e.x > body.x &&
        e.x - body.x < 46,
    );

    const jump = body.grounded && (noFloorAhead || wallAhead || obstacleAhead || stuckFor > 15);

    session.update({
      left: false,
      right: true,
      down: false,
      jumpHeld: true,
      jumpPressed: jump,
    });

    stuckFor = Math.abs(body.x - lastX) < 0.25 ? stuckFor + 1 : 0;
    lastX = body.x;

    if (session.state === 'complete' || session.state === 'gameOver') {
      return { session, ticks: tick };
    }
  }

  return { session, ticks: maxTicks };
}

describe('a bot can finish every level', () => {
  it.each(LEVELS.map((level, index) => [level.id, index, level.timeLimit] as const))(
    '%s',
    (_id, index, timeLimit) => {
      const { session, ticks } = playthrough(index, timeLimit * 60);

      expect(session.state).toBe('complete');
      // Comfortably inside the clock, so a child exploring has room to spare.
      expect(ticks / 60).toBeLessThan(timeLimit * 0.6);
    },
  );
});

describe('playing produces a sensible score', () => {
  it('collects bones and scores on the way through', () => {
    const { session } = playthrough(0, LEVELS[0]!.timeLimit * 60);
    expect(session.run.score).toBeGreaterThan(0);
    expect(session.run.lifetimeBones).toBeGreaterThan(5);
  });

  it('does not lose every life just getting to the end', () => {
    const { session } = playthrough(0, LEVELS[0]!.timeLimit * 60);
    expect(session.run.lives).toBeGreaterThan(0);
  });
});

describe('the chase finale', () => {
  const CHASE_LEVELS = LEVELS.filter((level) => level.chase !== undefined);

  it('is on the last level of every world and nowhere else', () => {
    expect(CHASE_LEVELS.map((level) => level.id)).toEqual(['w1-3', 'w2-3', 'w3-3']);
  });

  it('is slower than Roxy at a run, so it can always be outpaced', () => {
    for (const level of CHASE_LEVELS) {
      expect(level.chase!).toBeLessThan(PHYS.topSpeed / 2);
    }
  });

  function session(id: string): Session {
    const def = LEVELS.find((level) => level.id === id)!;
    return new Session(parseLevel(def), themeForWorld(def.world), createRun(), SILENT);
  }

  it('catches a player who stands still', () => {
    const play = session('w1-3');
    const startBones = 5;
    for (let i = 0; i < startBones; i++) play.run.bones += 1;

    const idle = { left: false, right: false, down: false, jumpHeld: false, jumpPressed: false };
    for (let tick = 0; tick < 60 * 20; tick++) play.update(idle);

    // It reached them: the bones are gone, or a life is.
    expect(play.run.bones === 0 || play.run.lives < 3).toBe(true);
  });

  it('gives a grace period rather than catching you off the spawn', () => {
    const play = session('w1-3');
    const idle = { left: false, right: false, down: false, jumpHeld: false, jumpPressed: false };
    for (let tick = 0; tick < 60; tick++) play.update(idle);
    expect(play.run.lives).toBe(3);
  });

  it('never overruns the goal, so the level always stays finishable', () => {
    const play = session('w3-3');
    const goal = play.level.entities.find((entity) => entity.kind === 'goal')!;
    const idle = { left: false, right: false, down: false, jumpHeld: false, jumpPressed: false };

    for (let tick = 0; tick < 60 * 300; tick++) {
      play.update(idle);
      if (play.chaseX !== null) expect(play.chaseX).toBeLessThan(goal.x);
    }
  });

  it('leaves the other levels alone', () => {
    const play = session('w1-1');
    expect(play.chaseX).toBeNull();
  });
});
