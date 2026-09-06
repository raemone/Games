/**
 * The ball simulation: gravity, walls, posts, flippers and nothing else.
 *
 * Everything here is a pure function over plain data. It knows about hitting a
 * thing with an id; it does not know that the thing is worth 500 points or that
 * it advances a mission. `session.ts` owns that half, which is what lets the
 * feel of the table be unit tested without a canvas.
 *
 * Units are table pixels and 60Hz ticks - the same convention as `loop.ts`.
 * The table is 380 x 680, roughly a real playfield's proportions, and gravity
 * is the real thing resolved along a 6.5-degree incline and scaled to match.
 */
/** A point or a direction on the playfield. */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export const GRAVITY = 0.22;

/**
 * A ball faster than this has usually been squeezed between the flipper and a
 * wall rather than legitimately hit, and left alone it tunnels straight through
 * the table. Capping is cheaper than a swept collision test and, at this speed,
 * invisible.
 */
export const MAX_SPEED = 24;

/**
 * Collision is resolved this many times per tick. The cap above means a ball
 * moves at most MAX_SPEED / SUBSTEPS = 4px between tests, comfortably less
 * than its own radius, so nothing passes through a wall between two frames.
 */
export const SUBSTEPS = 6;

/**
 * A hair of air drag, so a ball rattling in a pocket loses its energy instead
 * of pinging about for ever. Deliberately not a stop-below-a-threshold rule:
 * gravity adds only 0.037 per substep, so any such threshold would clamp a
 * resting ball's acceleration back to zero and glue it to the wall it settled
 * against - which is exactly the bug that eats a ball on a real table.
 */
const DRAG = 0.9995;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly radius: number;
  /**
   * Ids of the triggers this ball is currently inside. A trigger fires when a
   * ball enters it, so a ball that comes to rest on a rollover scores once
   * rather than sixty times a second.
   */
  readonly inside: Set<string>;
}

export function makeBall(x: number, y: number, vx = 0, vy = 0, radius = 9): Ball {
  return { x, y, vx, vy, radius, inside: new Set() };
}

/** A straight solid edge. Arcs are subdivided into these when the table loads. */
export interface Wall {
  readonly kind: 'wall';
  readonly a: Vec;
  readonly b: Vec;
  /** 0 absorbs the ball, 1 returns all of its speed. */
  readonly bounce: number;
  /** Reported in the tick's hit list when the ball is fast enough to matter. */
  readonly id?: string;
  /** Slingshot punch, added along the surface normal on a solid hit. */
  readonly kick?: number;
  /** Below this approach speed the kick does not fire - a dead bounce instead. */
  readonly kickThreshold?: number;
  /**
   * A one-way gate: the wall only stops balls sitting on this side of it and
   * moving towards it. The plunger lane's exit uses one, so a launched ball
   * pushes through and a ball coming back round the arch cannot drop in.
   */
  readonly blockNormal?: Vec;
}

/** A round solid: a post, a rubber, or a pop bumper when it carries a kick. */
export interface Post {
  readonly kind: 'post';
  readonly center: Vec;
  readonly radius: number;
  readonly bounce: number;
  readonly id?: string;
  readonly kick?: number;
}

/** A region the ball passes through: a rollover, a ramp mouth, a saucer. */
export interface Trigger {
  readonly kind: 'trigger';
  readonly id: string;
  readonly center: Vec;
  readonly radius: number;
}

export type Collider = Wall | Post;

export interface Flipper {
  readonly pivot: Vec;
  readonly length: number;
  readonly radius: number;
  /** Angles are clockwise from the +x axis, so a left flipper rests positive. */
  readonly restAngle: number;
  readonly activeAngle: number;
  /** Radians per tick while swinging. */
  readonly speed: number;
  angle: number;
  /** Radians per tick, signed. This is what gives the ball its kick. */
  angularVelocity: number;
  held: boolean;
}

export function makeFlipper(
  pivot: Vec,
  length: number,
  restAngle: number,
  activeAngle: number,
  radius = 7,
  speed = 0.42,
): Flipper {
  return {
    pivot,
    length,
    radius,
    restAngle,
    activeAngle,
    speed,
    angle: restAngle,
    angularVelocity: 0,
    held: false,
  };
}

export function flipperTip(flipper: Flipper): Vec {
  return {
    x: flipper.pivot.x + Math.cos(flipper.angle) * flipper.length,
    y: flipper.pivot.y + Math.sin(flipper.angle) * flipper.length,
  };
}

export interface World {
  readonly colliders: readonly Collider[];
  readonly triggers: readonly Trigger[];
  readonly flippers: readonly Flipper[];
  readonly balls: Ball[];
}

export type HitKind = 'wall' | 'post' | 'flipper' | 'trigger';

export interface Hit {
  readonly id: string;
  readonly kind: HitKind;
  /** Closing speed at the moment of contact, for scaling sound and effects. */
  readonly speed: number;
  /** Index into `world.balls` of the ball that made the hit. */
  readonly ball: number;
  readonly at: Vec;
}

/**
 * Advance the whole table by one 60Hz tick and report everything that was hit.
 *
 * Balls are never added or removed here. A drained ball is still a ball as far
 * as this function is concerned; deciding that it is out of play is the
 * session's job, because that decision costs the player a turn.
 */
export function step(world: World): Hit[] {
  const hits: Hit[] = [];
  const dt = 1 / SUBSTEPS;

  for (let s = 0; s < SUBSTEPS; s++) {
    for (const flipper of world.flippers) advanceFlipper(flipper, dt);

    for (const ball of world.balls) {
      ball.vy += GRAVITY * dt;
      ball.vx *= DRAG;
      ball.vy *= DRAG;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      capSpeed(ball);
    }

    for (let i = 0; i < world.balls.length; i++) {
      const ball = world.balls[i];
      if (!ball) continue;
      for (const collider of world.colliders) {
        const hit =
          collider.kind === 'wall'
            ? resolveWall(ball, collider)
            : resolvePost(ball, collider);
        if (hit && collider.id) {
          hits.push({ id: collider.id, kind: collider.kind, speed: hit.speed, ball: i, at: hit.at });
        }
      }
      for (const flipper of world.flippers) {
        const hit = resolveFlipper(ball, flipper);
        if (hit) {
          hits.push({ id: 'flipper', kind: 'flipper', speed: hit.speed, ball: i, at: hit.at });
        }
      }
    }

    resolveBallPairs(world.balls);
  }

  collectTriggers(world, hits);
  return hits;
}

function advanceFlipper(flipper: Flipper, dt: number): void {
  const target = flipper.held ? flipper.activeAngle : flipper.restAngle;
  const remaining = target - flipper.angle;
  const travel = flipper.speed * dt;
  const move = clamp(remaining, -travel, travel);
  flipper.angle += move;
  // Per-tick so the kick maths matches the ball's per-tick velocities.
  flipper.angularVelocity = move / dt;
}

function capSpeed(ball: Ball): void {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed <= MAX_SPEED) return;
  ball.vx = (ball.vx / speed) * MAX_SPEED;
  ball.vy = (ball.vy / speed) * MAX_SPEED;
}

interface Contact {
  readonly speed: number;
  readonly at: Vec;
}

/** Closest point to (px, py) on the segment a-b, as a 0..1 position along it. */
function closestT(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return 0;
  return clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
}

function resolveWall(ball: Ball, wall: Wall): Contact | null {
  const t = closestT(wall.a.x, wall.a.y, wall.b.x, wall.b.y, ball.x, ball.y);
  const cx = wall.a.x + (wall.b.x - wall.a.x) * t;
  const cy = wall.a.y + (wall.b.y - wall.a.y) * t;
  let nx = ball.x - cx;
  let ny = ball.y - cy;
  const distance = Math.hypot(nx, ny);
  if (distance >= ball.radius) return null;

  if (distance > 0) {
    nx /= distance;
    ny /= distance;
  } else {
    // Dead centre on the line. Push out along the wall's own normal instead of
    // dividing by zero; either side will do, and the ball is already inside.
    const dx = wall.b.x - wall.a.x;
    const dy = wall.b.y - wall.a.y;
    const len = Math.hypot(dx, dy) || 1;
    nx = dy / len;
    ny = -dx / len;
  }

  if (wall.blockNormal) {
    const onBlockedSide = nx * wall.blockNormal.x + ny * wall.blockNormal.y > 0;
    const movingIntoWall = ball.vx * wall.blockNormal.x + ball.vy * wall.blockNormal.y < 0;
    if (!onBlockedSide || !movingIntoWall) return null;
  }

  return separate(ball, nx, ny, ball.radius - distance, wall.bounce, wall.kick ?? 0, wall.kickThreshold ?? 0, { x: cx, y: cy });
}

function resolvePost(ball: Ball, post: Post): Contact | null {
  let nx = ball.x - post.center.x;
  let ny = ball.y - post.center.y;
  const distance = Math.hypot(nx, ny);
  const minimum = ball.radius + post.radius;
  if (distance >= minimum) return null;

  if (distance > 0) {
    nx /= distance;
    ny /= distance;
  } else {
    nx = 0;
    ny = -1;
  }

  const at = { x: post.center.x + nx * post.radius, y: post.center.y + ny * post.radius };
  return separate(ball, nx, ny, minimum - distance, post.bounce, post.kick ?? 0, 0, at);
}

/**
 * Push the ball out of a surface along `n` and reflect the part of its velocity
 * that was heading into it. Returns null when the ball was already moving away,
 * which happens constantly while it rolls along a wall - overlapping is not the
 * same thing as hitting.
 */
function separate(
  ball: Ball,
  nx: number,
  ny: number,
  depth: number,
  bounce: number,
  kick: number,
  kickThreshold: number,
  at: Vec,
): Contact | null {
  ball.x += nx * depth;
  ball.y += ny * depth;

  const approach = ball.vx * nx + ball.vy * ny;
  if (approach >= 0) return null;

  ball.vx -= (1 + bounce) * approach * nx;
  ball.vy -= (1 + bounce) * approach * ny;

  const speed = -approach;
  // A pop bumper or slingshot adds its own energy, but only when the ball
  // arrived with some of its own. Otherwise a ball resting against a rubber
  // gets fired across the table for free.
  if (kick > 0 && speed >= kickThreshold) {
    ball.vx += nx * kick;
    ball.vy += ny * kick;
  }
  capSpeed(ball);
  return { speed, at };
}

/**
 * A flipper is a capsule swinging about its pivot. The ball bounces off the
 * capsule's surface, but relative to how fast that surface is moving - which is
 * the whole trick: the same collision code gives a dead bounce off a resting
 * flipper and a hard shot off a swinging one, with the tip hitting hardest.
 */
function resolveFlipper(ball: Ball, flipper: Flipper): Contact | null {
  const tip = flipperTip(flipper);
  const t = closestT(flipper.pivot.x, flipper.pivot.y, tip.x, tip.y, ball.x, ball.y);
  const cx = flipper.pivot.x + (tip.x - flipper.pivot.x) * t;
  const cy = flipper.pivot.y + (tip.y - flipper.pivot.y) * t;

  let nx = ball.x - cx;
  let ny = ball.y - cy;
  const distance = Math.hypot(nx, ny);
  const minimum = ball.radius + flipper.radius;
  if (distance >= minimum) return null;

  if (distance > 0) {
    nx /= distance;
    ny /= distance;
  } else {
    nx = 0;
    ny = -1;
  }

  ball.x += nx * (minimum - distance);
  ball.y += ny * (minimum - distance);

  // Velocity of the flipper's surface at the contact point: omega x r.
  const rx = cx - flipper.pivot.x;
  const ry = cy - flipper.pivot.y;
  const surfaceX = -flipper.angularVelocity * ry;
  const surfaceY = flipper.angularVelocity * rx;

  const relativeX = ball.vx - surfaceX;
  const relativeY = ball.vy - surfaceY;
  const approach = relativeX * nx + relativeY * ny;
  if (approach >= 0) return null;

  const bounce = 0.5;
  ball.vx -= (1 + bounce) * approach * nx;
  ball.vy -= (1 + bounce) * approach * ny;
  capSpeed(ball);
  return { speed: -approach, at: { x: cx, y: cy } };
}

/** Equal-mass elastic collision, so multiball balls shove each other about. */
function resolveBallPairs(balls: readonly Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (!a) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (!b) continue;
      let nx = b.x - a.x;
      let ny = b.y - a.y;
      const distance = Math.hypot(nx, ny);
      const minimum = a.radius + b.radius;
      if (distance >= minimum) continue;
      if (distance > 0) {
        nx /= distance;
        ny /= distance;
      } else {
        nx = 1;
        ny = 0;
      }

      const overlap = (minimum - distance) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (approach >= 0) continue;
      const impulse = approach * 0.9;
      a.vx += impulse * nx;
      a.vy += impulse * ny;
      b.vx -= impulse * nx;
      b.vy -= impulse * ny;
    }
  }
}

/**
 * Triggers are sampled once a tick rather than once a substep. A rollover is
 * wide enough that no ball crosses it inside a tick, and sampling once means a
 * ball wobbling on the edge of one cannot fire it six times.
 */
function collectTriggers(world: World, hits: Hit[]): void {
  for (let i = 0; i < world.balls.length; i++) {
    const ball = world.balls[i];
    if (!ball) continue;
    for (const trigger of world.triggers) {
      const inside =
        Math.hypot(ball.x - trigger.center.x, ball.y - trigger.center.y) <= trigger.radius;
      if (inside && !ball.inside.has(trigger.id)) {
        ball.inside.add(trigger.id);
        hits.push({
          id: trigger.id,
          kind: 'trigger',
          speed: Math.hypot(ball.vx, ball.vy),
          ball: i,
          at: { x: ball.x, y: ball.y },
        });
      } else if (!inside) {
        ball.inside.delete(trigger.id);
      }
    }
  }
}

/** A nudge: the same shove applied to every ball, plus the tilt it risks. */
export function nudge(balls: readonly Ball[], dx: number, dy: number): void {
  for (const ball of balls) {
    ball.vx += dx;
    ball.vy += dy;
    capSpeed(ball);
  }
}
