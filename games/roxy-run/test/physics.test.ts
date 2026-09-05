import { beforeEach, describe, expect, it } from 'vitest';
import { PHYS, createBody, launch, setRolling, step, type Body } from '../src/game/physics';
import { NO_INPUT, input, tileMap } from './helpers';
import { TILE } from '../src/game/collision';
import type { PhysicsInput } from '../src/game/physics';
import type { TileMap } from '../src/game/collision';

// A long flat floor with plenty of headroom. It has to be genuinely long:
// at top speed Roxy covers 6px a frame, and hitting the level edge mid-test
// would look exactly like a physics bug.
const WIDE = 400;
const GROUND = tileMap([
  ' '.repeat(WIDE),
  ' '.repeat(WIDE),
  ' '.repeat(WIDE),
  ' '.repeat(WIDE),
  '#'.repeat(WIDE),
]);

/** Drop a body onto the floor and settle it, so tests start from a known state. */
function standing(x = 100): Body {
  const body = createBody(x, 40);
  for (let i = 0; i < 30; i++) step(body, NO_INPUT, GROUND);
  if (!body.grounded) throw new Error('body failed to land on the test floor');
  return body;
}

function run(body: Body, frames: number, held: Partial<PhysicsInput>, map: TileMap = GROUND): void {
  for (let i = 0; i < frames; i++) step(body, input(held), map);
}

describe('running', () => {
  let body: Body;
  beforeEach(() => {
    body = standing();
  });

  it('accelerates up to top speed but no further', () => {
    run(body, 600, { right: true });
    expect(body.gsp).toBeCloseTo(PHYS.topSpeed, 5);
  });

  it('takes a deliberate moment to wind up to top speed', () => {
    // Roughly topSpeed / accel frames, i.e. a couple of seconds - the wind-up
    // is what makes going fast feel earned rather than granted.
    let frames = 0;
    while (body.gsp < PHYS.topSpeed - 0.01 && frames < 1000) {
      step(body, input({ right: true }), GROUND);
      frames++;
    }
    expect(frames).toBeGreaterThan(100);
    expect(frames).toBeLessThan(160);
  });

  it('brakes much faster than it accelerates', () => {
    run(body, 200, { right: true });
    const top = body.gsp;
    step(body, input({ left: true }), GROUND);
    expect(top - body.gsp).toBeCloseTo(PHYS.decel, 5);
  });

  it('coasts to a complete stop without overshooting into reverse', () => {
    run(body, 200, { right: true });
    run(body, 1000, {});
    expect(body.gsp).toBe(0);
  });

  it('faces the direction of travel', () => {
    run(body, 10, { right: true });
    expect(body.facing).toBe(1);
    run(body, 10, { left: true });
    expect(body.facing).toBe(-1);
  });
});

describe('jumping', () => {
  it('leaves the ground and comes back down', () => {
    const body = standing();
    const floorY = body.y;
    step(body, input({ jumpPressed: true, jumpHeld: true }), GROUND);
    expect(body.grounded).toBe(false);
    expect(body.ysp).toBeCloseTo(-PHYS.jumpForce, 5);

    run(body, 200, { jumpHeld: true });
    expect(body.grounded).toBe(true);
    expect(body.y).toBeCloseTo(floorY, 5);
  });

  it('goes lower when the button is released early', () => {
    const held = standing();
    const tapped = standing();
    step(held, input({ jumpPressed: true, jumpHeld: true }), GROUND);
    step(tapped, input({ jumpPressed: true, jumpHeld: true }), GROUND);

    let heldPeak = held.y;
    let tappedPeak = tapped.y;
    for (let i = 0; i < 60; i++) {
      step(held, input({ jumpHeld: true }), GROUND);
      step(tapped, NO_INPUT, GROUND); // released immediately
      heldPeak = Math.min(heldPeak, held.y);
      tappedPeak = Math.min(tappedPeak, tapped.y);
    }
    expect(tappedPeak).toBeGreaterThan(heldPeak + 8);
  });

  it('carries horizontal momentum into the air', () => {
    const body = standing();
    run(body, 300, { right: true });
    step(body, input({ right: true, jumpPressed: true, jumpHeld: true }), GROUND);
    expect(body.xsp).toBeCloseTo(PHYS.topSpeed, 1);
  });

  it('cannot be started again while already airborne', () => {
    const body = standing();
    step(body, input({ jumpPressed: true, jumpHeld: true }), GROUND);
    const rising = body.ysp;
    step(body, input({ jumpPressed: true, jumpHeld: true }), GROUND);
    expect(body.ysp).toBeGreaterThan(rising); // gravity only, no second launch
  });
});

describe('slopes', () => {
  // A gentle hill rising to the right, then a flat shelf.
  const HILL = tileMap([
    '                    ',
    '            ####### ',
    '        ab/######## ',
    '####################',
  ]);

  it('does not climb faster than it runs on the flat', () => {
    const body = createBody(40, 24);
    for (let i = 0; i < 30; i++) step(body, NO_INPUT, HILL);
    expect(body.grounded).toBe(true);
    run(body, 120, { right: true }, HILL);

    const flat = standing();
    run(flat, 120, { right: true });
    expect(body.gsp).toBeLessThanOrEqual(flat.gsp + 1e-9);
  });

  it('pulls a standing body back down the hill', () => {
    const body = createBody(9 * 16 + 8, 24);
    for (let i = 0; i < 5; i++) step(body, NO_INPUT, HILL);
    const before = body.x;
    run(body, 60, {}, HILL);
    expect(body.x).toBeLessThan(before);
  });
});

describe('rolling', () => {
  it('only starts when already moving', () => {
    const slow = standing();
    run(slow, 5, { down: true });
    expect(slow.rolling).toBe(false);

    const fast = standing();
    run(fast, 200, { right: true });
    step(fast, input({ down: true }), GROUND);
    expect(fast.rolling).toBe(true);
  });

  it('holds its speed longer than running does', () => {
    const rolled = standing();
    run(rolled, 200, { right: true });
    step(rolled, input({ down: true }), GROUND);
    run(rolled, 60, {});

    const ran = standing();
    run(ran, 200, { right: true });
    run(ran, 61, {});

    expect(rolled.gsp).toBeGreaterThan(ran.gsp);
  });

  it('stands back up once it slows to a crawl', () => {
    const body = standing();
    run(body, 200, { right: true });
    step(body, input({ down: true }), GROUND);
    run(body, 2000, {});
    expect(body.rolling).toBe(false);
  });

  it('keeps the feet planted when the hitbox shrinks', () => {
    const body = standing();
    const feet = body.y + body.heightRadius;
    setRolling(body, true);
    expect(body.y + body.heightRadius).toBeCloseTo(feet, 5);
  });
});

describe('spindash', () => {
  it('launches faster than running from a standstill', () => {
    const body = standing();
    step(body, input({ down: true, jumpPressed: true, jumpHeld: true }), GROUND);
    expect(body.spindash).not.toBeNull();

    for (let i = 0; i < 3; i++) {
      step(body, input({ down: true, jumpPressed: true, jumpHeld: true }), GROUND);
      step(body, input({ down: true }), GROUND);
    }
    step(body, NO_INPUT, GROUND); // release

    expect(body.spindash).toBeNull();
    expect(body.rolling).toBe(true);
    expect(Math.abs(body.gsp)).toBeGreaterThan(PHYS.topSpeed);
  });

  it('cannot be charged while already moving', () => {
    const body = standing();
    run(body, 100, { right: true });
    step(body, input({ down: true, jumpPressed: true, jumpHeld: true }), GROUND);
    expect(body.spindash).toBeNull();
  });
});

describe('obstacles', () => {
  it('stops dead at a wall instead of tunnelling through it', () => {
    const map = tileMap([
      '     #    ',
      '     #    ',
      '##########',
    ]);
    const body = createBody(16, 16);
    for (let i = 0; i < 10; i++) step(body, NO_INPUT, map);
    run(body, 400, { right: true }, map);
    expect(body.x).toBeLessThanOrEqual(5 * 16);
    expect(body.gsp).toBe(0);
  });

  it('falls off the end of a ledge', () => {
    const map = tileMap([
      '          ',
      '          ',
      '####      ',
    ]);
    const body = createBody(16, 16);
    for (let i = 0; i < 10; i++) step(body, NO_INPUT, map);
    expect(body.grounded).toBe(true);
    run(body, 200, { right: true }, map);
    expect(body.grounded).toBe(false);
    expect(body.ysp).toBeGreaterThan(0);
  });

  it('bonks its head on a ceiling', () => {
    const map = tileMap([
      '##########',
      '          ',
      '          ',
      '##########',
    ]);
    const body = createBody(80, 40);
    for (let i = 0; i < 10; i++) step(body, NO_INPUT, map);
    launch(body, 0, -12);
    for (let i = 0; i < 10; i++) step(body, NO_INPUT, map);
    expect(body.y - body.heightRadius).toBeGreaterThanOrEqual(16);
  });
});

describe('climbing', () => {
  // Flat run-up, then a 45 degree ramp up to a shelf, exactly as a level joins
  // a flat segment to a hill.
  // Long flat run-up, a 45 degree ramp, then a long shelf. Both stretches have
  // to be genuinely long or Roxy hits the level edge and the test reads that
  // as a physics failure.
  const RUN_UP = 24;
  const SHELF = 60;
  const RAMP = tileMap([
    ' '.repeat(RUN_UP + SHELF + 3),
    ' '.repeat(RUN_UP + SHELF + 3),
    `${' '.repeat(RUN_UP + 2)}/${'#'.repeat(SHELF)}`,
    `${' '.repeat(RUN_UP + 1)}/${'#'.repeat(SHELF + 1)}`,
    `${' '.repeat(RUN_UP)}/${'#'.repeat(SHELF + 2)}`,
    '#'.repeat(RUN_UP + SHELF + 3),
    '#'.repeat(RUN_UP + SHELF + 3),
  ]);

  it('runs up a ramp instead of stopping dead at the bottom of it', () => {
    const body = createBody(24, 40);
    for (let i = 0; i < 20; i++) step(body, NO_INPUT, RAMP);
    expect(body.grounded).toBe(true);
    const startY = body.y;

    run(body, 240, { right: true }, RAMP);

    // Up the ramp and onto the shelf: higher than it started, and still moving.
    expect(body.y).toBeLessThan(startY - 32);
    expect(body.x).toBeGreaterThan((RUN_UP + 6) * 16);
    expect(Math.abs(body.gsp)).toBeGreaterThan(1);
  });

  it('keeps some speed up the ramp rather than grinding to a halt', () => {
    const body = createBody(24, 40);
    for (let i = 0; i < 20; i++) step(body, NO_INPUT, RAMP);
    run(body, 200, { right: true }, RAMP);
    expect(body.gsp).toBeGreaterThan(3);
  });

  it('is still stopped by a wall two tiles high', () => {
    const wall = tileMap([
      '     #    ',
      '     #    ',
      '##########',
    ]);
    const body = createBody(16, 16);
    for (let i = 0; i < 10; i++) step(body, NO_INPUT, wall);
    const floorY = body.y;

    run(body, 400, { right: true }, wall);
    expect(body.x).toBeLessThanOrEqual(5 * 16);
    // Crucially it must not have climbed the wall a tile at a time.
    expect(body.y).toBeCloseTo(floorY, 1);
  });

  it('steps up a shallow lip without needing a jump', () => {
    const lip = tileMap([
      '          ',
      '     -----',
      '##########',
    ]);
    const body = createBody(16, 16);
    for (let i = 0; i < 10; i++) step(body, NO_INPUT, lip);
    const floorY = body.y;
    run(body, 200, { right: true }, lip);
    expect(body.x).toBeGreaterThan(7 * 16);
    expect(body.y).toBeLessThan(floorY);
  });
});

describe('springs', () => {
  /**
   * The spring in the `spring` segment has to lift Roxy onto a shelf four
   * tiles up. Softening the bounce is a feel decision, but drop it too far and
   * that shelf - and the bones on it - become unreachable, so the height is
   * pinned here rather than left to be discovered by a stuck child.
   */
  const SHELF_RISE = 4 * TILE;

  it('lifts Roxy clear of the shelf above it', () => {
    const body = standing();
    const floorY = body.y;
    launch(body, 0, -PHYS.springForce);

    let peak = body.y;
    for (let i = 0; i < 200; i++) {
      step(body, NO_INPUT, GROUND);
      peak = Math.min(peak, body.y);
      if (body.grounded) break;
    }

    const rise = floorY - peak;
    expect(rise, 'a spring must clear the shelf it is placed under').toBeGreaterThan(
      SHELF_RISE + TILE,
    );
  });

  it('is gentler than it used to be, so the landing stays in view', () => {
    const body = standing();
    const floorY = body.y;
    launch(body, 0, -PHYS.springForce);

    let peak = body.y;
    for (let i = 0; i < 200; i++) {
      step(body, NO_INPUT, GROUND);
      peak = Math.min(peak, body.y);
      if (body.grounded) break;
    }

    // Under half the 270px screen, so Roxy never leaves the top of it.
    expect(floorY - peak).toBeLessThan(135);
  });
});
