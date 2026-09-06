import { describe, expect, it } from 'vitest';
import {
  GRAVITY,
  GRAVITY_Z,
  MAX_SPEED,
  ROLLING_GRAVITY,
  SUBSTEPS,
  makeBall,
  makeFlipper,
  nudge,
  step,
} from '../src/game/physics';
import type { Post, Trigger, Wall } from '../src/game/physics';
import { bareWorld } from './helpers';

const floor = (bounce: number): Wall => ({
  kind: 'wall',
  a: { x: -200, y: 100 },
  b: { x: 200, y: 100 },
  bounce,
});

describe('gravity', () => {
  it('rolls a ball down the slope at five sevenths of gravity', () => {
    // Two sevenths of the work goes into spinning the sphere up. This is the
    // number the whole table was laid out against, so it is worth pinning.
    const ball = makeBall(0, 0);
    const world = bareWorld([], [ball]);
    step(world);
    expect(ball.vy).toBeCloseTo(ROLLING_GRAVITY, 2);
    expect(ball.vy).toBeLessThan(GRAVITY);
  });

  it('gives a ball in the air the whole of gravity instead', () => {
    // Nothing is spinning up: an airborne ball has no contact to grip against.
    const ball = makeBall(0, 0);
    ball.z = 40;
    const world = bareWorld([], [ball]);
    step(world);
    // Air drag takes a whisker off both, hence two places rather than three.
    expect(ball.vy).toBeCloseTo(GRAVITY, 2);
    expect(ball.vz).toBeCloseTo(-GRAVITY_Z, 2);
  });

  it('spins the ball up as it rolls, in the direction it is travelling', () => {
    const ball = makeBall(0, 0);
    const world = bareWorld([], [ball]);
    for (let i = 0; i < 60; i++) step(world);
    // Rolling in +y means the contact point is stationary, which for a ball of
    // radius R means a spin of -v/R about the x axis.
    expect(ball.spin.x).toBeCloseTo(-ball.vy / ball.radius, 1);
  });

  it('never clamps a slow ball to a standstill', () => {
    // A rest threshold looks harmless and is not: gravity adds a thirty-seventh
    // of a pixel per substep, so anything that zeroes small velocities glues a
    // ball to the wall it settled against and eats it.
    const wall: Wall = { kind: 'wall', a: { x: 10, y: -100 }, b: { x: 10, y: 100 }, bounce: 0.3 };
    const ball = makeBall(1, 0);
    const world = bareWorld([wall], [ball]);
    for (let i = 0; i < 120; i++) step(world);
    expect(ball.y).toBeGreaterThan(50);
  });
});

describe('walls', () => {
  it('bounces back a fraction of the speed it arrived with', () => {
    const ball = makeBall(0, 80, 0, 10);
    const world = bareWorld([floor(0.5)], [ball]);
    for (let i = 0; i < 10 && ball.vy > 0; i++) step(world);
    expect(ball.vy).toBeLessThan(0);
    expect(Math.abs(ball.vy)).toBeGreaterThan(3);
    expect(Math.abs(ball.vy)).toBeLessThan(8);
  });

  it('keeps the ball outside the wall it hit', () => {
    const ball = makeBall(0, 80, 0, MAX_SPEED);
    const world = bareWorld([floor(0.2)], [ball]);
    for (let i = 0; i < 60; i++) {
      step(world);
      expect(ball.y).toBeLessThanOrEqual(100 + 0.001);
    }
  });

  it('does not pass through a wall at full speed', () => {
    // The substep count is chosen so a ball moves less than its own radius
    // between collision tests. If that ever stops being true, this fails.
    expect(MAX_SPEED / SUBSTEPS).toBeLessThan(makeBall(0, 0).radius);
  });
});

describe('one-way gates', () => {
  const gate: Wall = {
    kind: 'wall',
    a: { x: -50, y: 0 },
    b: { x: 50, y: 0 },
    bounce: 0.2,
    blockNormal: { x: 0, y: -1 },
  };

  it('stops a ball coming from the side it guards', () => {
    const ball = makeBall(0, -40, 0, 8);
    const world = bareWorld([gate], [ball]);
    for (let i = 0; i < 60; i++) step(world);
    expect(ball.y).toBeLessThan(0);
  });

  it('lets a ball through from the other side', () => {
    const ball = makeBall(0, 40, 0, -8);
    const world = bareWorld([gate], [ball]);
    for (let i = 0; i < 10; i++) step(world);
    expect(ball.y).toBeLessThan(-9);
  });
});

describe('posts', () => {
  it('adds its kick only to a ball that arrived with some speed of its own', () => {
    const bumper: Post = {
      kind: 'post',
      center: { x: 0, y: 0 },
      radius: 15,
      bounce: 0.3,
      kick: 6,
      id: 'bumper',
    };

    const ball = makeBall(0, -40, 0, 6);
    const world = bareWorld([bumper], [ball]);
    let speedAfterHit = 0;
    for (let i = 0; i < 30 && speedAfterHit === 0; i++) {
      if (step(world).some((hit) => hit.id === 'bumper')) {
        speedAfterHit = Math.hypot(ball.vx, ball.vy);
      }
    }
    // Arrived at 6, left at more than 6: the bumper put energy in.
    expect(speedAfterHit).toBeGreaterThan(6);
  });

});

describe('slingshots', () => {
  const sling = (): Wall => ({
    kind: 'wall',
    a: { x: -60, y: 0 },
    b: { x: 60, y: 0 },
    bounce: 0.4,
    kick: 5,
    kickThreshold: 0.9,
    id: 'sling',
  });

  it('punches a ball that arrived with speed', () => {
    const ball = makeBall(0, -40, 0, 5);
    const world = bareWorld([sling()], [ball]);
    for (let i = 0; i < 30 && ball.vy > 0; i++) step(world);
    expect(ball.vy).toBeLessThan(-6);
  });

  it('stays quiet under a ball that only dribbled onto it', () => {
    // Without the threshold a ball resting on a rubber is fired across the
    // table for free, over and over, which is a table that plays itself.
    const ball = makeBall(0, -9.2, 0, 0);
    const world = bareWorld([sling()], [ball]);
    for (let i = 0; i < 20; i++) step(world);
    expect(ball.vy).toBeGreaterThan(-1);
  });
});

describe('flippers', () => {
  it('hits a ball harder than it arrived, and hardest at the tip', () => {
    const speedAt = (along: number): number => {
      const flipper = makeFlipper({ x: 0, y: 0 }, 52, 0.5, -0.55);
      const ball = makeBall(
        Math.cos(0.5) * 52 * along + Math.sin(0.5) * 16.2,
        Math.sin(0.5) * 52 * along - Math.cos(0.5) * 16.2,
      );
      const world = { colliders: [], triggers: [], flippers: [flipper], balls: [ball] };
      for (let tick = 0; tick < 30; tick++) {
        flipper.held = tick < 22;
        step(world);
      }
      return Math.hypot(ball.vx, ball.vy);
    };

    expect(speedAt(0.9)).toBeGreaterThan(4);
    expect(speedAt(0.9)).toBeGreaterThan(speedAt(0.4));
  });

  it('never throws a ball off a flipper that is not moving', () => {
    const flipper = makeFlipper({ x: 0, y: 0 }, 52, 0.5, -0.55);
    const ball = makeBall(
      Math.cos(0.5) * 26 + Math.sin(0.5) * 16.2,
      Math.sin(0.5) * 26 - Math.cos(0.5) * 16.2,
    );
    const world = { colliders: [], triggers: [], flippers: [flipper], balls: [ball] };
    for (let i = 0; i < 60; i++) {
      step(world);
      // It rolls down the flipper and off the end, but it is never launched.
      expect(ball.vy).toBeGreaterThan(-0.5);
    }
  });
});

describe('triggers', () => {
  const trigger: Trigger = { kind: 'trigger', id: 'lane', center: { x: 0, y: 0 }, radius: 20 };

  it('fires once per pass, not once per tick', () => {
    const ball = makeBall(0, -60, 0, 3);
    const world = bareWorld([], [ball], [trigger]);
    let fired = 0;
    for (let i = 0; i < 120; i++) fired += step(world).filter((h) => h.id === 'lane').length;
    expect(fired).toBe(1);
  });

  it('fires again after the ball has left and come back', () => {
    const ball = makeBall(0, 0);
    const world = bareWorld([], [ball], [trigger]);
    step(world);
    ball.y = -100;
    step(world);
    ball.y = 0;
    expect(step(world).filter((h) => h.id === 'lane')).toHaveLength(1);
  });
});

describe('spin', () => {
  it('picks sidespin up off a wall it grazes', () => {
    // A ball sliding along a rubber leaves it turning. Without this the ball is
    // a point with a picture of a sphere on it.
    const wall: Wall = { kind: 'wall', a: { x: 10, y: -200 }, b: { x: 10, y: 200 }, bounce: 0.4 };
    const ball = makeBall(0, 0, 3, 9);
    const world = bareWorld([wall], [ball]);
    for (let i = 0; i < 20; i++) step(world);
    expect(Math.abs(ball.spin.z)).toBeGreaterThan(0.02);
  });

  it('lands and settles rather than bouncing for ever', () => {
    const ball = makeBall(0, 0);
    ball.z = 30;
    const world = bareWorld([], [ball]);
    for (let i = 0; i < 240; i++) step(world);
    expect(ball.z).toBe(0);
    expect(ball.vz).toBe(0);
  });
});

describe('nudge', () => {
  it('shoves every ball by the same amount', () => {
    const balls = [makeBall(0, 0), makeBall(40, 0, 1, 1)];
    nudge(balls, 2, -1);
    expect(balls[0]!.vx).toBeCloseTo(2);
    expect(balls[1]!.vx).toBeCloseTo(3);
    expect(balls[1]!.vy).toBeCloseTo(0);
  });

  it('cannot push a ball past the speed cap', () => {
    const ball = makeBall(0, 0, MAX_SPEED, 0);
    nudge([ball], 50, 0);
    expect(Math.hypot(ball.vx, ball.vy)).toBeLessThanOrEqual(MAX_SPEED + 0.001);
  });
});
