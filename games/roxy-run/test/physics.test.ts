import { beforeEach, describe, expect, it } from 'vitest';
import { PHYS, createBody, launch, setRolling, step, type Body } from '../src/game/physics';
import { NO_INPUT, input, tileMap } from './helpers';
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
