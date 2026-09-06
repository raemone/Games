/**
 * The ball simulation: a steel sphere on an inclined plane, and the geometry it
 * hits. Gravity, contact, friction and spin, and nothing else.
 *
 * Everything here is a pure function over plain data. It knows about hitting a
 * thing with an id; it does not know that the thing is worth 500 points or that
 * it advances a mission. `session.ts` owns that half, which is what lets the
 * feel of the table be unit tested without a canvas.
 *
 * Units are table pixels and 60Hz ticks - the same convention as `loop.ts`.
 * The table is 380 x 680, roughly a real playfield's proportions, on a
 * 6.5-degree incline like a real one.
 *
 * The ball is a rigid sphere, not a point. It carries an angular velocity, and
 * every contact applies a Coulomb friction impulse alongside the normal one, so
 * the ball spins up as it rolls, picks up sidespin off a rubber and carries
 * that spin into its next bounce. That is not decoration: a rolling sphere
 * accelerates down a slope at five sevenths of the rate a sliding one does,
 * because two sevenths of the work goes into spinning it up, and shots that
 * were tuned without it land somewhere else.
 *
 * `z` is height above the playfield. It is zero almost all of the time - a
 * pinball rarely leaves the wood - but a slingshot or a pop bumper can pop the
 * ball into the air, and letting it happen is most of what makes a 3D table
 * look alive rather than like a diagram with lighting.
 */
/** A point or a direction on the playfield. */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

/** An angular velocity, in radians per tick, about each table axis. */
export interface Spin {
  x: number;
  y: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Gravity resolved along the incline. A rolling sphere only gets five sevenths
 * of this - the rest spins it up - so the figure here is the 0.22 the table was
 * laid out against, divided by 5/7. A ball that is sliding, or in the air, does
 * get the whole of it, which is exactly the difference between the two.
 */
export const GRAVITY = 0.308;

/** What a rolling ball actually accelerates at. Only used by tests and tools. */
export const ROLLING_GRAVITY = (GRAVITY * 5) / 7;

/** Downwards, off the playfield and towards the glass, for a ball in the air. */
export const GRAVITY_Z = 1.94;

/**
 * Steel on a waxed, mylar-topped playfield. Very low - real ones are slick on
 * purpose - but not nothing: it is what spins the ball up out of a slide.
 */
const PLAYFIELD_FRICTION = 0.1;
/** Rails and posts. Slicker than the playfield, but enough to impart sidespin. */
const WALL_FRICTION = 0.12;
/** How much of its speed the ball keeps bouncing off the playfield itself. */
const PLAYFIELD_BOUNCE = 0.3;

/** Flipper rubber. Grippy, which is why a flipper shot comes off with backspin. */
const FLIPPER_FRICTION = 0.5;
const FLIPPER_BOUNCE = 0.5;

/**
 * Rolling resistance. Tiny, and nothing like sliding friction: it is what stops
 * a ball rolling round a flat table for ever, and no more than that.
 */
const ROLLING_RESISTANCE = 0.0016;

/**
 * A ball faster than this has usually been squeezed between the flipper and a
 * wall rather than legitimately hit, and left alone it tunnels straight through
 * the table. Capping is cheaper than a swept collision test and, at this speed,
 * invisible.
 */
export const MAX_SPEED = 30;

/**
 * Collision is resolved this many times per tick. The cap above means a ball
 * moves at most MAX_SPEED / SUBSTEPS = 5px between tests, comfortably less
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
  /** Height above the playfield. Zero while the ball is on the wood. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Radians per tick about each table axis. Drives the look, and the curve. */
  readonly spin: Spin;
  readonly radius: number;
  /**
   * Ids of the triggers this ball is currently inside. A trigger fires when a
   * ball enters it, so a ball that comes to rest on a rollover scores once
   * rather than sixty times a second.
   */
  readonly inside: Set<string>;
}

export function makeBall(x: number, y: number, vx = 0, vy = 0, radius = 9): Ball {
  return { x, y, z: 0, vx, vy, vz: 0, spin: { x: 0, y: 0, z: 0 }, radius, inside: new Set() };
}

/**
 * Set the spin that matches the ball's current velocity, so it is rolling
 * rather than sliding.
 *
 * A ball fired up the lane by a plunger is gripped by the lane and rolls within
 * a centimetre or two; simulating that slide costs it a third of its energy and
 * a plunge that should reach the top of the table dies halfway up. So anywhere
 * the game hands the ball a velocity out of nothing - the plunger, a saucer
 * kick-out - it hands it the matching spin too.
 */
export function setRolling(ball: Ball): void {
  ball.spin.x = -ball.vy / ball.radius;
  ball.spin.y = ball.vx / ball.radius;
}

/** Moment of inertia of a solid sphere is (2/5)mR², so this is m/I with m = 1. */
function inverseInertia(radius: number): number {
  return 2.5 / (radius * radius);
}

/** Velocity of the point on the ball's surface at offset r from its centre. */
function contactVelocity(ball: Ball, rx: number, ry: number, rz: number): Spin {
  return {
    x: ball.vx + ball.spin.y * rz - ball.spin.z * ry,
    y: ball.vy + ball.spin.z * rx - ball.spin.x * rz,
    z: ball.vz + ball.spin.x * ry - ball.spin.y * rx,
  };
}

/** Apply an impulse at offset r, which changes the spin as well as the speed. */
function applyImpulse(
  ball: Ball,
  jx: number,
  jy: number,
  jz: number,
  rx: number,
  ry: number,
  rz: number,
): void {
  ball.vx += jx;
  ball.vy += jy;
  ball.vz += jz;
  const k = inverseInertia(ball.radius);
  ball.spin.x += k * (ry * jz - rz * jy);
  ball.spin.y += k * (rz * jx - rx * jz);
  ball.spin.z += k * (rx * jy - ry * jx);
}

/**
 * The whole contact model, in one place: bounce along the normal, then a
 * Coulomb friction impulse across it.
 *
 * The friction term is what makes the table feel like it has a surface. It
 * spins the ball up as it rolls, it puts sidespin on a ball that grazes a
 * rubber, and because the impulse acts at the ball's skin rather than its
 * centre, the spin it creates bends the next shot. `2/7` is the impulse that
 * would stop a sphere's contact point dead; friction is capped at that, so it
 * can bring a sliding ball into a roll but never spin it backwards.
 *
 * Returns the closing speed, or null when the ball was already moving away -
 * which happens constantly as it rolls along a wall. Overlapping is not the
 * same thing as hitting.
 */
function resolveContact(
  ball: Ball,
  nx: number,
  ny: number,
  nz: number,
  bounce: number,
  friction: number,
): number | null {
  const rx = -nx * ball.radius;
  const ry = -ny * ball.radius;
  const rz = -nz * ball.radius;
  const contact = contactVelocity(ball, rx, ry, rz);

  const closing = contact.x * nx + contact.y * ny + contact.z * nz;
  if (closing >= 0) return null;

  const normal = -(1 + bounce) * closing;
  applyImpulse(ball, normal * nx, normal * ny, normal * nz, rx, ry, rz);

  const tx = contact.x - closing * nx;
  const ty = contact.y - closing * ny;
  const tz = contact.z - closing * nz;
  const sliding = Math.hypot(tx, ty, tz);
  if (sliding > 1e-6 && friction > 0) {
    const grip = Math.min(friction * normal, (2 / 7) * sliding);
    applyImpulse(ball, (-grip * tx) / sliding, (-grip * ty) / sliding, (-grip * tz) / sliding, rx, ry, rz);
  }

  return -closing;
}

/**
 * The ball resting on the playfield, which is where it spends nearly all of its
 * life. There is no collision here - nothing is closing - but the table is
 * still holding the ball up, and that supporting force is what friction acts
 * against. Without this a ball would slide down the slope like a hockey puck.
 */
function playfieldContact(ball: Ball, dt: number): void {
  const rz = -ball.radius;
  const slipX = ball.vx + ball.spin.y * rz;
  const slipY = ball.vy - ball.spin.x * rz;
  const slipping = Math.hypot(slipX, slipY);

  if (slipping > 1e-6) {
    // The normal force over one substep is what a Coulomb limit is a fraction
    // of, so a ball pressed harder into the table grips harder.
    const support = GRAVITY_Z * dt;
    const grip = Math.min(PLAYFIELD_FRICTION * support, (2 / 7) * slipping);
    applyImpulse(ball, (-grip * slipX) / slipping, (-grip * slipY) / slipping, 0, 0, 0, rz);
  }

  // Rolling resistance, applied to speed and spin together so that a ball
  // already rolling stays rolling as it slows.
  const decay = 1 - ROLLING_RESISTANCE;
  ball.vx *= decay;
  ball.vy *= decay;
  ball.spin.x *= decay;
  ball.spin.y *= decay;
  ball.spin.z *= decay;
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

      // Height is its own little simulation: full gravity towards the wood, and
      // a bounce when it gets there. On the table the ball is instead resting,
      // and what matters is the friction that resting contact allows.
      if (ball.z > 0 || ball.vz > 0) {
        ball.vz -= GRAVITY_Z * dt;
        ball.z += ball.vz * dt;
        if (ball.z <= 0) {
          ball.z = 0;
          resolveContact(ball, 0, 0, 1, PLAYFIELD_BOUNCE, PLAYFIELD_FRICTION);
          // Below a millimetre of hop it is on the table, not bouncing on it.
          if (Math.abs(ball.vz) < 0.35) ball.vz = 0;
        }
      } else {
        ball.z = 0;
        ball.vz = 0;
        playfieldContact(ball, dt);
      }

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
  if (speed > MAX_SPEED) {
    ball.vx = (ball.vx / speed) * MAX_SPEED;
    ball.vy = (ball.vy / speed) * MAX_SPEED;
  }
  // A ball squeezed between a flipper and a wall can otherwise accumulate spin
  // for ever, and a sphere doing four thousand rpm renders as a grey smear.
  const spinCap = (MAX_SPEED * 2) / ball.radius;
  const spin = Math.hypot(ball.spin.x, ball.spin.y, ball.spin.z);
  if (spin > spinCap) {
    const scale = spinCap / spin;
    ball.spin.x *= scale;
    ball.spin.y *= scale;
    ball.spin.z *= scale;
  }
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

  // A kicker only kicks along its face. At either end the closest point is the
  // endpoint itself and the normal swings round to point wherever the ball
  // happens to be, so a ball skimming the top of a slingshot gets fired
  // vertically. Two slingshots facing each other then trade a ball back and
  // forth for ever, each one relaunching it before gravity can bring it down -
  // a rally that never ends and a game that never gets to ball two. On a real
  // table those ends are the posts the rubber is stretched over, and a post
  // does not kick.
  const onFace = t > 0.08 && t < 0.92;

  return separate(
    ball,
    nx,
    ny,
    ball.radius - distance,
    wall.bounce,
    onFace ? (wall.kick ?? 0) : 0,
    wall.kickThreshold ?? 0,
    { x: cx, y: cy },
  );
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
 * Push the ball out of a vertical surface and resolve the contact against it.
 * Walls are upright, so the normal has no height component.
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

  const speed = resolveContact(ball, nx, ny, 0, bounce, WALL_FRICTION);
  if (speed === null) return null;

  // A pop bumper or slingshot adds its own energy, but only when the ball
  // arrived with some of its own. Otherwise a ball resting against a rubber
  // gets fired across the table for free.
  if (kick > 0 && speed >= kickThreshold) {
    ball.vx += nx * kick;
    ball.vy += ny * kick;
    // Rubber squeezes as well as pushes, and some of that comes out as lift.
    ball.vz += kick * 0.22;
  } else if (speed > 9) {
    // A hard hit on a rail hops the ball a little. It is what stops a fast
    // rattle looking like a diagram of a fast rattle.
    ball.vz += (speed - 9) * 0.06;
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

  // Velocity of the flipper's own surface at the contact point: omega x r.
  const surfaceX = -flipper.angularVelocity * (cy - flipper.pivot.y);
  const surfaceY = flipper.angularVelocity * (cx - flipper.pivot.x);

  const rx = -nx * ball.radius;
  const ry = -ny * ball.radius;
  const contact = contactVelocity(ball, rx, ry, 0);
  const relX = contact.x - surfaceX;
  const relY = contact.y - surfaceY;
  const relZ = contact.z;

  const closing = relX * nx + relY * ny;
  if (closing >= 0) return null;

  const normal = -(1 + FLIPPER_BOUNCE) * closing;
  applyImpulse(ball, normal * nx, normal * ny, 0, rx, ry, 0);

  // The rubber grips hard, so a swinging flipper drags the ball's surface along
  // with it and sends it away spinning. That backspin is why a flipper shot up
  // an orbit holds its line instead of drifting into the wall.
  const tx = relX - closing * nx;
  const ty = relY - closing * ny;
  const sliding = Math.hypot(tx, ty, relZ);
  if (sliding > 1e-6) {
    const grip = Math.min(FLIPPER_FRICTION * normal, (2 / 7) * sliding);
    applyImpulse(ball, (-grip * tx) / sliding, (-grip * ty) / sliding, (-grip * relZ) / sliding, rx, ry, 0);
  }

  capSpeed(ball);
  return { speed: -closing, at: { x: cx, y: cy } };
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
