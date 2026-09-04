import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { parseLevel } from '../src/game/level';
import { findFloor, isWallAt } from '../src/game/collision';
import { createRun } from '../src/game/scoring';
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
