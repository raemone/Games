import { describe, expect, it } from 'vitest';
import { Euler, Vector3 } from 'three';
import {
  FLIPPER_ACTIVE_ANGLE,
  FLIPPER_LENGTH,
  FLIPPER_REST_ANGLE,
} from '../src/game/table';
import { FLIPPER_MODEL_AXIS, flipperRotation } from '../src/render/scene';

/**
 * Where the physics is actually holding the bat, in world axes. Table space is
 * x across and y down the table; the scene maps table y onto world z.
 */
function physicsHeading(angle: number): Vector3 {
  return new Vector3(Math.cos(angle), 0, Math.sin(angle));
}

/** Where the renderer draws it. */
function drawnHeading(angle: number): Vector3 {
  const [x, y, z] = flipperRotation(angle);
  return FLIPPER_MODEL_AXIS.clone().applyEuler(new Euler(x, y, z, 'YXZ'));
}

/** Both flippers, at rest, mid-swing and fully up. */
const ANGLES = [
  FLIPPER_REST_ANGLE,
  FLIPPER_ACTIVE_ANGLE,
  (FLIPPER_REST_ANGLE + FLIPPER_ACTIVE_ANGLE) / 2,
  Math.PI - FLIPPER_REST_ANGLE,
  Math.PI - FLIPPER_ACTIVE_ANGLE,
  0,
  Math.PI / 2,
];

describe('the flipper bat on screen', () => {
  it('points exactly where the physics is holding it', () => {
    // The bug this catches shipped: the bats were drawn a quarter turn out, so
    // the ball rebounded off a flipper that was visibly somewhere else.
    for (const angle of ANGLES) {
      const off = (drawnHeading(angle).angleTo(physicsHeading(angle)) * 180) / Math.PI;
      expect({ angle, degreesOff: Math.round(off) }).toEqual({ angle, degreesOff: 0 });
    }
  });

  it('lies across the table at rest rather than down it', () => {
    // A real flipper rests a little under thirty degrees below horizontal. If
    // it is ever more down-table than across, it is drawn standing up.
    for (const angle of [FLIPPER_REST_ANGLE, Math.PI - FLIPPER_REST_ANGLE]) {
      const drawn = drawnHeading(angle);
      expect(Math.abs(drawn.x)).toBeGreaterThan(Math.abs(drawn.z));
    }
  });

  it('swings up-table when it fires, and stays flat on the wood', () => {
    for (const angle of [FLIPPER_ACTIVE_ANGLE, Math.PI - FLIPPER_ACTIVE_ANGLE]) {
      const drawn = drawnHeading(angle);
      // Up the table is -z. A flipper that fired towards the drain is inverted.
      expect(drawn.z).toBeLessThan(0);
      // And it never lifts off the playfield.
      expect(Math.abs(drawn.y)).toBeLessThan(1e-9);
    }
  });

  it('puts the tip where the physics puts the tip', () => {
    for (const angle of ANGLES) {
      const tip = drawnHeading(angle).multiplyScalar(FLIPPER_LENGTH);
      expect(tip.x).toBeCloseTo(Math.cos(angle) * FLIPPER_LENGTH, 6);
      expect(tip.z).toBeCloseTo(Math.sin(angle) * FLIPPER_LENGTH, 6);
    }
  });
});
