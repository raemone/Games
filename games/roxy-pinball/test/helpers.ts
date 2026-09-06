import { Audio } from '../src/engine/audio';
import type { InputState } from '../src/engine/input';
import {
  makeBall,
  makeFlipper,
  step,
  type Ball,
  type Collider,
  type Flipper,
  type Trigger,
  type World,
} from '../src/game/physics';
import {
  FLIPPER_ACTIVE_ANGLE,
  FLIPPER_LEFT_PIVOT,
  FLIPPER_LENGTH,
  FLIPPER_REST_ANGLE,
  FLIPPER_RIGHT_PIVOT,
  staticColliders,
  standingDropTargets,
  tableTriggers,
} from '../src/game/table';

export const NO_INPUT: InputState = {
  leftFlipper: false,
  rightFlipper: false,
  plungerHeld: false,
  plungerReleased: false,
  nudgeLeft: false,
  nudgeRight: false,
  nudgeUp: false,
  pausePressed: false,
  confirmPressed: false,
};

export function input(overrides: Partial<InputState>): InputState {
  return { ...NO_INPUT, ...overrides };
}

/**
 * The Audio class never touches the DOM until `unlock()` is called, and it is
 * never called here, so the real thing can stand in for itself under Node -
 * which is better than a mock, because it also proves the calls type-check.
 */
export function silentAudio(): Audio {
  return new Audio();
}

/** A world with nothing in it but the colliders a test asks for. */
export function bareWorld(colliders: Collider[], balls: Ball[], triggers: Trigger[] = []): World {
  return { colliders, triggers, flippers: [], balls };
}

export function tableFlippers(): Flipper[] {
  return [
    makeFlipper(FLIPPER_LEFT_PIVOT, FLIPPER_LENGTH, FLIPPER_REST_ANGLE, FLIPPER_ACTIVE_ANGLE),
    makeFlipper(
      FLIPPER_RIGHT_PIVOT,
      FLIPPER_LENGTH,
      Math.PI - FLIPPER_REST_ANGLE,
      Math.PI - FLIPPER_ACTIVE_ANGLE,
    ),
  ];
}

/** The real table, with every drop target standing. */
export function tableWorld(balls: Ball[] = [], flippers = tableFlippers()): World {
  return {
    colliders: [...staticColliders(), ...standingDropTargets([false, false, false, false])],
    triggers: tableTriggers(),
    flippers,
    balls,
  };
}

/** A ball resting on a flipper, `along` of the way from its pivot to its tip. */
export function cradledBall(flipper: Flipper, along: number): Ball {
  const dx = Math.cos(flipper.restAngle);
  const dy = Math.sin(flipper.restAngle);
  const out = flipper.pivot.x < 173 ? 1 : -1;
  const gap = 16.2;
  return makeBall(
    flipper.pivot.x + dx * flipper.length * along + dy * gap * out,
    flipper.pivot.y + dy * flipper.length * along - dx * gap * out,
  );
}

export interface ShotResult {
  readonly hits: Set<string>;
  readonly drained: boolean;
  readonly ticks: number;
  readonly ball: Ball;
}

/**
 * Flip a cradled ball and follow it until it drains or the clock runs out,
 * collecting the id of everything it touched.
 */
export function takeShot(
  side: 'left' | 'right',
  along: number,
  delay: number,
  maxTicks = 900,
  drainY = 646,
): ShotResult {
  const flippers = tableFlippers();
  const flipper = side === 'left' ? flippers[0]! : flippers[1]!;
  const ball = cradledBall(flipper, along);
  const world = tableWorld([ball], flippers);
  const hits = new Set<string>();

  for (let tick = 0; tick < maxTicks; tick++) {
    flipper.held = tick >= delay && tick < delay + 22;
    for (const hit of step(world)) if (hit.id) hits.add(hit.id);
    if (ball.y > drainY) return { hits, drained: true, ticks: tick, ball };
  }
  return { hits, drained: false, ticks: maxTicks, ball };
}
