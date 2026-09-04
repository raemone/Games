/**
 * Roxy's movement: slope-aware momentum, rolling, and jumping.
 *
 * Constants are the Mega Drive values, tuned per 60Hz frame, because they are
 * what makes the running feel like Sonic rather than like Mario. The module is
 * pure - a body, an input snapshot and a tile map go in, a mutated body comes
 * out - so the feel can be unit tested without a canvas.
 */
import { TILE, type TileMap, findCeiling, findFloor, isWallAt } from './collision';
import { DEFAULT_FEEL, type SurfaceFeel } from './tiles';

export const PHYS = {
  accel: 0.046875,
  friction: 0.046875,
  decel: 0.5,
  topSpeed: 6,
  airAccel: 0.09375,
  gravity: 0.21875,
  jumpForce: 6.5,
  /** Releasing jump early clips upward speed to this. */
  jumpCut: 4,
  slopeFactor: 0.125,
  slopeRollUp: 0.078125,
  slopeRollDown: 0.3125,
  rollFriction: 0.0234375,
  rollDecel: 0.125,
  /** Below this ground speed on a steep slope, Roxy slips off. */
  slipSpeed: 2.5,
  slipLockFrames: 30,
  maxSpeed: 16,
  /** Rolling only starts above this speed, so you cannot roll on the spot. */
  minRollSpeed: 1.03125,
  /** Rolling stops below this. */
  unrollSpeed: 0.5,
  spindashChargeMax: 8,
} as const;

export const STAND_RADIUS = { x: 10, y: 14 } as const;
export const ROLL_RADIUS = { x: 10, y: 10 } as const;

export interface PhysicsInput {
  readonly left: boolean;
  readonly right: boolean;
  readonly down: boolean;
  readonly jumpHeld: boolean;
  readonly jumpPressed: boolean;
}

export interface Body {
  x: number;
  y: number;
  /** Speed along the ground surface. Only meaningful while grounded. */
  gsp: number;
  xsp: number;
  ysp: number;
  /** Surface angle in radians while grounded, 0 in the air. */
  angle: number;
  grounded: boolean;
  rolling: boolean;
  /** In a jump Roxy started (so it can be cut short); not merely falling. */
  jumping: boolean;
  /** Frames of suppressed horizontal input after slipping off a slope. */
  controlLock: number;
  facing: 1 | -1;
  /** Spindash charge, or null when not charging. */
  spindash: number | null;
  widthRadius: number;
  heightRadius: number;
}

export function createBody(x: number, y: number): Body {
  return {
    x,
    y,
    gsp: 0,
    xsp: 0,
    ysp: 0,
    angle: 0,
    grounded: false,
    rolling: false,
    jumping: false,
    controlLock: 0,
    facing: 1,
    spindash: null,
    widthRadius: STAND_RADIUS.x,
    heightRadius: STAND_RADIUS.y,
  };
}

/** Advance the body by one 60Hz tick. */
export function step(
  body: Body,
  input: PhysicsInput,
  map: TileMap,
  feel: SurfaceFeel = DEFAULT_FEEL,
): void {
  if (body.grounded) {
    stepGround(body, input, map, feel);
  } else {
    stepAir(body, input, map);
  }
}

function stepGround(body: Body, input: PhysicsInput, map: TileMap, feel: SurfaceFeel): void {
  if (body.controlLock > 0) body.controlLock--;

  if (body.spindash !== null) {
    stepSpindash(body, input);
    if (body.spindash !== null) {
      // Still winding up: no movement, but stay glued to the floor.
      snapToFloor(body, map);
      return;
    }
  }

  applySlopeFactor(body);

  const locked = body.controlLock > 0;
  if (body.rolling) {
    applyRollControl(body, input, locked, feel);
  } else {
    applyRunControl(body, input, locked, feel);
  }

  maybeStartRoll(body, input);
  maybeStartSpindash(body, input);
  if (body.spindash !== null) {
    snapToFloor(body, map);
    return;
  }

  if (input.jumpPressed) {
    jump(body);
    return;
  }

  moveAlongGround(body, map);
  slipCheck(body);
}

function applySlopeFactor(body: Body): void {
  const sin = Math.sin(body.angle);
  if (!body.rolling) {
    body.gsp += PHYS.slopeFactor * sin;
    return;
  }
  // Rolling accelerates hard downhill and barely climbs, which is what makes
  // hills worth riding.
  const downhill = body.gsp === 0 || Math.sign(body.gsp) === Math.sign(sin);
  body.gsp += (downhill ? PHYS.slopeRollDown : PHYS.slopeRollUp) * sin;
}

function applyRunControl(
  body: Body,
  input: PhysicsInput,
  locked: boolean,
  feel: SurfaceFeel,
): void {
  const accel = PHYS.accel * feel.bite;
  const decel = PHYS.decel * feel.grip;
  const friction = PHYS.friction * feel.grip;

  if (!locked && input.left && !input.right) {
    body.facing = -1;
    if (body.gsp > 0) {
      body.gsp = Math.max(body.gsp - decel, -PHYS.topSpeed);
    } else if (body.gsp > -PHYS.topSpeed) {
      body.gsp = Math.max(body.gsp - accel, -PHYS.topSpeed);
    }
    return;
  }

  if (!locked && input.right && !input.left) {
    body.facing = 1;
    if (body.gsp < 0) {
      body.gsp = Math.min(body.gsp + decel, PHYS.topSpeed);
    } else if (body.gsp < PHYS.topSpeed) {
      body.gsp = Math.min(body.gsp + accel, PHYS.topSpeed);
    }
    return;
  }

  // No input: bleed off speed, but never past a standstill.
  body.gsp -= Math.min(Math.abs(body.gsp), friction) * Math.sign(body.gsp);
}

function applyRollControl(
  body: Body,
  input: PhysicsInput,
  locked: boolean,
  feel: SurfaceFeel,
): void {
  const decel = PHYS.rollDecel * feel.grip;
  const friction = PHYS.rollFriction * feel.grip;

  // While rolling you can brake but not accelerate - momentum is the whole point.
  if (!locked && input.left && body.gsp > 0) {
    body.gsp = Math.max(body.gsp - decel, 0);
  } else if (!locked && input.right && body.gsp < 0) {
    body.gsp = Math.min(body.gsp + decel, 0);
  }

  body.gsp -= Math.min(Math.abs(body.gsp), friction) * Math.sign(body.gsp);

  if (Math.abs(body.gsp) < PHYS.unrollSpeed) setRolling(body, false);
}

function maybeStartRoll(body: Body, input: PhysicsInput): void {
  if (body.rolling || body.spindash !== null) return;
  if (!input.down || input.left || input.right) return;
  if (Math.abs(body.gsp) < PHYS.minRollSpeed) return;
  setRolling(body, true);
}

function maybeStartSpindash(body: Body, input: PhysicsInput): void {
  if (body.spindash !== null || body.rolling) return;
  if (!input.down || !input.jumpPressed) return;
  if (Math.abs(body.gsp) > 0.05) return; // only from a standstill
  body.spindash = 0;
}

function stepSpindash(body: Body, input: PhysicsInput): void {
  if (body.spindash === null) return;

  if (!input.down) {
    // Release: launch in the direction Roxy is facing.
    body.gsp = (8 + Math.floor(body.spindash) / 2) * body.facing;
    body.spindash = null;
    setRolling(body, true);
    return;
  }

  if (input.jumpPressed) {
    body.spindash = Math.min(body.spindash + 2, PHYS.spindashChargeMax);
  } else {
    body.spindash = Math.max(0, body.spindash - body.spindash / 0.75 / 256);
  }
}

function jump(body: Body): void {
  const sin = Math.sin(body.angle);
  const cos = Math.cos(body.angle);
  // Launch along the surface normal, so jumping off a ramp throws you outward.
  body.xsp = body.gsp * cos + PHYS.jumpForce * sin;
  body.ysp = body.gsp * sin - PHYS.jumpForce * cos;
  body.grounded = false;
  body.jumping = true;
  body.angle = 0;
  setRolling(body, false);
}

function moveAlongGround(body: Body, map: TileMap): void {
  body.gsp = clamp(body.gsp, -PHYS.maxSpeed, PHYS.maxSpeed);
  body.x += body.gsp * Math.cos(body.angle);
  body.y += body.gsp * Math.sin(body.angle);

  pushOutOfWalls(body, map, Math.sign(body.gsp));
  snapToFloor(body, map);
}

function slipCheck(body: Body): void {
  if (!body.grounded) return;
  const steepness = Math.abs(Math.sin(body.angle));
  if (steepness <= 0.7 || Math.abs(body.gsp) >= PHYS.slipSpeed) return;

  body.gsp = 0;
  body.controlLock = PHYS.slipLockFrames;
  // Very steep: lose the floor entirely rather than sticking to a wall.
  if (steepness > 0.9) {
    body.grounded = false;
    body.xsp = 0;
    body.ysp = 0;
    body.angle = 0;
  }
}

function stepAir(body: Body, input: PhysicsInput, map: TileMap): void {
  if (input.left && !input.right) {
    body.facing = -1;
    if (body.xsp > -PHYS.topSpeed) {
      body.xsp = Math.max(body.xsp - PHYS.airAccel, -PHYS.topSpeed);
    }
  } else if (input.right && !input.left) {
    body.facing = 1;
    if (body.xsp < PHYS.topSpeed) {
      body.xsp = Math.min(body.xsp + PHYS.airAccel, PHYS.topSpeed);
    }
  }

  // Variable jump height: let go early and the rise is cut short.
  if (body.jumping && !input.jumpHeld && body.ysp < -PHYS.jumpCut) {
    body.ysp = -PHYS.jumpCut;
  }

  // Air drag near the top of a jump, which is what gives the arc its shape.
  if (body.ysp < 0 && body.ysp > -PHYS.jumpCut) {
    body.xsp -= body.xsp / 0.125 / 256;
  }

  body.ysp = clamp(body.ysp + PHYS.gravity, -PHYS.maxSpeed, PHYS.maxSpeed);
  body.xsp = clamp(body.xsp, -PHYS.maxSpeed, PHYS.maxSpeed);

  body.x += body.xsp;
  body.y += body.ysp;

  pushOutOfWalls(body, map, Math.sign(body.xsp));

  if (body.ysp < 0) {
    // Sweep by the distance just travelled so a spring launch cannot tunnel.
    const ceiling = findCeiling(map, body.x, body.y - body.heightRadius, -body.ysp);
    if (ceiling !== null) {
      body.y = ceiling + body.heightRadius;
      body.ysp = 0;
    }
    return;
  }

  land(body, map);
}

/** Look for ground beneath a falling body and stick to it. */
function land(body: Body, map: TileMap): void {
  const reach = Math.max(4, Math.min(body.ysp + 4, 16));
  const hit = bestFloor(body, map, reach);
  if (!hit) return;

  body.y = hit.y - body.heightRadius;
  body.angle = hit.angle;
  body.grounded = true;
  body.jumping = false;
  // Project air velocity onto the surface so landing on a ramp keeps speed.
  body.gsp = body.xsp * Math.cos(hit.angle) + body.ysp * Math.sin(hit.angle);
  body.ysp = 0;
}

/** Keep a grounded body glued to the surface, or let it fall off a ledge. */
function snapToFloor(body: Body, map: TileMap): void {
  const reach = Math.min(4 + Math.abs(body.gsp), 14);
  const hit = bestFloor(body, map, reach);
  if (!hit) {
    body.grounded = false;
    body.xsp = body.gsp * Math.cos(body.angle);
    body.ysp = body.gsp * Math.sin(body.angle);
    body.angle = 0;
    return;
  }
  body.y = hit.y - body.heightRadius;
  body.angle = hit.angle;
}

/** Two ground sensors, one per edge; the nearer surface wins. */
function bestFloor(body: Body, map: TileMap, reach: number) {
  const sensorY = body.y + body.heightRadius;
  const left = findFloor(map, body.x - body.widthRadius, sensorY, reach);
  const right = findFloor(map, body.x + body.widthRadius, sensorY, reach);
  if (!left) return right;
  if (!right) return left;
  return left.distance <= right.distance ? left : right;
}

function pushOutOfWalls(body: Body, map: TileMap, dir: number): void {
  if (dir === 0) return;
  const probeX = body.x + body.widthRadius * dir;
  // Probe at chest height: the feet are the floor sensors' job, so a ramp does
  // not read as a wall.
  const probeY = body.y - 4;
  if (!isWallAt(map, probeX, probeY)) return;

  const tx = Math.floor(probeX / TILE);
  body.x = dir > 0 ? tx * TILE - body.widthRadius : (tx + 1) * TILE + body.widthRadius;
  if (body.grounded) {
    body.gsp = 0;
  } else {
    body.xsp = 0;
  }
}

export function setRolling(body: Body, rolling: boolean): void {
  if (body.rolling === rolling) return;
  const radius = rolling ? ROLL_RADIUS : STAND_RADIUS;
  // Keep the feet planted when the hitbox changes height.
  body.y += body.heightRadius - radius.y;
  body.rolling = rolling;
  body.widthRadius = radius.x;
  body.heightRadius = radius.y;
}

/** Bounce off something - a spring, or an enemy's head. */
export function launch(body: Body, xsp: number, ysp: number): void {
  setRolling(body, false);
  body.grounded = false;
  body.jumping = false;
  body.angle = 0;
  body.xsp = xsp;
  body.ysp = ysp;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
