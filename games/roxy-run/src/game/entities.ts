/**
 * Everything in a level that is not terrain: collectibles, hazards, enemies and
 * moving platforms.
 *
 * All of them share one flat struct and one update switch. That is deliberate -
 * with this few kinds, a class hierarchy would cost more to read than it saves,
 * and a flat array is what the collision loop wants anyway.
 */
import { TILE, type TileMap, findFloor, isWallAt } from './collision';
import type { EntityKind, Level } from './level';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Collision size per kind, centred on the entity's position. */
const SIZES: Readonly<Record<EntityKind, { w: number; h: number }>> = {
  bone: { w: 18, h: 18 }, // generous on purpose - missing bones is not fun
  spring: { w: 16, h: 12 },
  springLeft: { w: 12, h: 16 },
  springRight: { w: 12, h: 16 },
  boost: { w: 16, h: 16 },
  walker: { w: 20, h: 18 },
  flyer: { w: 20, h: 14 },
  pigeon: { w: 18, h: 14 },
  falcon: { w: 22, h: 16 },
  spike: { w: 16, h: 10 },
  checkpoint: { w: 14, h: 30 },
  // Deliberately taller than any level: arriving off a spring used to sail
  // clean over the kennel and strand the player at the level's far wall. The
  // end of a level must be impossible to miss, however you arrive at it.
  goal: { w: 30, h: 640 },
  crate: { w: 16, h: 16 },
  // Generous, like the bone: a power-up you walked past would just annoy.
  star: { w: 20, h: 20 },
  platformH: { w: 48, h: 12 },
  platformV: { w: 48, h: 12 },
};

const WALKER_SPEED = 0.45;
const FLYER_SPEED = 0.7;
const FLYER_AMPLITUDE = 22;
/**
 * How far either side of its spawn a flyer will drift.
 *
 * Without a bound they only ever turn at walls, so one can wander the length of
 * a level and end up hovering over a pit - where a hit knocks the player
 * backwards into the hole. A bounded patrol is also simply easier to read.
 *
 * Three tiles: the banks either side of a pit are eight tiles wide, so this is
 * what lets a flyer patrol one without its range reaching open air.
 */
const FLYER_RANGE = 48;
/** Pigeons cruise dead level and slower than the ducks - the gentle one. */
const PIGEON_SPEED = 0.45;
const PIGEON_RANGE = 56;

/**
 * Falcons perch, then stoop on Roxy when she passes underneath.
 *
 * The wind-up is the whole reason this is fair: half a second of the bird
 * hanging with its wings up, in a distinct pose, before it commits. Without it
 * a dive is just damage that arrives from off screen.
 */
const FALCON_TRIGGER_X = 104;
const FALCON_WINDUP = 30;
const FALCON_DIVE_SPEED = 2.8;
const FALCON_DIVE_DRIFT = 1.5;
const FALCON_CLIMB_SPEED = 1.1;
/** How far a perched falcon drifts up and down while it waits. */
const FALCON_PERCH_BOB = 3;
/** How far below its perch a stoop goes before the bird pulls out. */
const FALCON_DIVE_DEPTH = 140;

const PLATFORM_SPEED = 0.8;
const PLATFORM_RANGE = 64;

export interface Entity {
  readonly kind: EntityKind;
  x: number;
  y: number;
  /** Spawn position - patrol centres and respawns both key off it. */
  readonly homeX: number;
  readonly homeY: number;
  vx: number;
  vy: number;
  /** Free-running counter used for bobbing, wing beats and patrol phase. */
  t: number;
  facing: 1 | -1;
  /** Collected, bopped or broken. Taken entities are skipped and not drawn. */
  taken: boolean;
  /** Checkpoints only: already activated. */
  triggered: boolean;
  /** Falcons only: committed to a stoop. */
  diving: boolean;
  /** Falcons only: ticks of telegraph left before the stoop begins. */
  windup: number;
}

function startingSpeed(kind: EntityKind): number {
  if (kind === 'walker') return -WALKER_SPEED;
  if (kind === 'flyer') return -FLYER_SPEED;
  if (kind === 'pigeon') return -PIGEON_SPEED;
  return 0;
}

export function createEntities(level: Level): Entity[] {
  return level.entities.map((spawn) => ({
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    homeX: spawn.x,
    homeY: spawn.y,
    vx: startingSpeed(spawn.kind),
    vy: 0,
    t: 0,
    facing: -1,
    taken: false,
    triggered: false,
    diving: false,
    windup: 0,
  }));
}

export function boxOf(entity: Entity): Box {
  const size = SIZES[entity.kind];
  return { x: entity.x - size.w / 2, y: entity.y - size.h / 2, w: size.w, h: size.h };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Where Roxy is, for the enemies that react to her. */
export interface Target {
  readonly x: number;
  readonly y: number;
}

/** Advance one entity by a tick. Entities never collide with each other. */
export function updateEntity(entity: Entity, map: TileMap, target: Target): void {
  entity.t += 1;
  if (entity.taken) return;

  switch (entity.kind) {
    case 'walker':
      patrol(entity, map);
      break;
    case 'flyer':
      hover(entity, map);
      break;
    case 'pigeon':
      cruise(entity, map);
      break;
    case 'falcon':
      stoop(entity, map, target);
      break;
    case 'platformH':
      entity.x = entity.homeX + Math.sin(entity.t * (PLATFORM_SPEED / 60)) * PLATFORM_RANGE;
      break;
    case 'platformV':
      entity.y = entity.homeY + Math.sin(entity.t * (PLATFORM_SPEED / 60)) * PLATFORM_RANGE;
      break;
    default:
      // Bones, springs, spikes and the goal are all static; their animation is
      // purely a function of `t` and happens at draw time.
      break;
  }
}

/** Walk back and forth, turning at walls and, crucially, at ledges. */
function patrol(entity: Entity, map: TileMap): void {
  const next = entity.x + entity.vx;
  const ahead = next + Math.sign(entity.vx) * (SIZES.walker.w / 2);

  const blocked = isWallAt(map, ahead, entity.y);
  // Look for ground a little way in front; without this they march off cliffs.
  const groundAhead = findFloor(map, ahead, entity.y + SIZES.walker.h / 2 - 2, 12);

  if (blocked || !groundAhead) {
    entity.vx = -entity.vx;
    entity.facing = entity.vx < 0 ? -1 : 1;
    return;
  }

  entity.x = next;
  entity.facing = entity.vx < 0 ? -1 : 1;

  // Settle onto the surface so patrollers follow slopes.
  const below = findFloor(map, entity.x, entity.y + SIZES.walker.h / 2 - 2, 12);
  if (below) entity.y = below.y - SIZES.walker.h / 2;
}

/** Drift horizontally on a sine wave, bouncing off walls. */
function hover(entity: Entity, map: TileMap): void {
  const next = entity.x + entity.vx;
  const outOfRange = Math.abs(next - entity.homeX) > FLYER_RANGE;
  if (outOfRange || isWallAt(map, next + Math.sign(entity.vx) * (SIZES.flyer.w / 2), entity.y)) {
    entity.vx = -entity.vx;
  } else {
    entity.x = next;
  }
  entity.facing = entity.vx < 0 ? -1 : 1;
  entity.y = entity.homeY + Math.sin(entity.t / 34) * FLYER_AMPLITUDE;
}

/**
 * Pigeons hold a dead straight line, which is what makes them the readable
 * one: no bob to time, so they can be jumped or bopped on sight.
 */
function cruise(entity: Entity, map: TileMap): void {
  const next = entity.x + entity.vx;
  const outOfRange = Math.abs(next - entity.homeX) > PIGEON_RANGE;
  if (outOfRange || isWallAt(map, next + Math.sign(entity.vx) * (SIZES.pigeon.w / 2), entity.y)) {
    entity.vx = -entity.vx;
  } else {
    entity.x = next;
  }
  entity.facing = entity.vx < 0 ? -1 : 1;
  entity.y = entity.homeY;
}

/**
 * Falcons hang on a perch and stoop on Roxy when she passes below, then climb
 * back. The telegraph before the dive is what keeps it fair; without it the
 * bird arrives faster than a child can react.
 */
function stoop(entity: Entity, map: TileMap, target: Target): void {
  if (entity.diving) {
    entity.x += entity.vx;
    entity.y += entity.vy;

    const underside = entity.y + SIZES.falcon.h / 2;
    const hitGround = findFloor(map, entity.x, underside, 6) !== null;
    if (hitGround || entity.y > entity.homeY + FALCON_DIVE_DEPTH) {
      entity.diving = false;
      entity.vx = 0;
      entity.vy = 0;
    }
    return;
  }

  // Track Roxy whatever else it is doing, so the bird always faces the way it
  // would stoop. This has to happen before the early returns below.
  const dx = target.x - entity.x;
  entity.facing = dx < 0 ? -1 : 1;

  // Climb back to the perch before it can threaten anyone again. The threshold
  // has to clear the perch bob: compared against homeY exactly, the bob itself
  // reads as "below the perch", and the bird spends every other tick climbing
  // instead of watching.
  if (entity.y > entity.homeY + FALCON_PERCH_BOB + 1) {
    entity.y = Math.max(entity.homeY, entity.y - FALCON_CLIMB_SPEED);
    return;
  }

  if (entity.windup > 0) {
    entity.windup -= 1;
    if (entity.windup === 0) {
      entity.diving = true;
      entity.vx = Math.sign(dx || 1) * FALCON_DIVE_DRIFT;
      entity.vy = FALCON_DIVE_SPEED;
    }
    return;
  }

  entity.y = entity.homeY + Math.sin(entity.t / 40) * FALCON_PERCH_BOB;
  // Only stoop on someone below: a bird diving upward reads as a bug.
  if (Math.abs(dx) < FALCON_TRIGGER_X && target.y > entity.y + 20) {
    entity.windup = FALCON_WINDUP;
  }
}

/** True when this kind hurts Roxy on contact from any direction. */
export function isHazard(kind: EntityKind): boolean {
  return kind === 'spike';
}

/** True when this kind can be bopped from above and hurts from the side. */
export function isEnemy(kind: EntityKind): boolean {
  return kind === 'walker' || isFlying(kind);
}

/** Everything that patrols the air, and so must never be left over a pit. */
export function isFlying(kind: EntityKind): boolean {
  return kind === 'flyer' || kind === 'pigeon' || kind === 'falcon';
}

/**
 * How far either side of its spawn a flying enemy can get. Falcons move
 * furthest, because a stoop carries them down and along.
 */
export function flyingReach(kind: EntityKind): number {
  if (kind === 'falcon') return FALCON_DIVE_DEPTH;
  if (kind === 'pigeon') return PIGEON_RANGE;
  return FLYER_RANGE;
}

/** True when this kind should be drawn as a solid you can stand on. */
export function isPlatform(kind: EntityKind): boolean {
  return kind === 'platformH' || kind === 'platformV';
}

/** The world y of a platform's top surface. */
export function platformTop(entity: Entity): number {
  return entity.y - SIZES[entity.kind].h / 2;
}

/** Tiles are 16px; entities spawn on tile centres, so this keeps them aligned. */
export function snapToTile(value: number): number {
  return Math.floor(value / TILE) * TILE + TILE / 2;
}
