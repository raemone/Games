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
  spike: { w: 16, h: 10 },
  checkpoint: { w: 14, h: 30 },
  // Deliberately taller than any level: arriving off a spring used to sail
  // clean over the kennel and strand the player at the level's far wall. The
  // end of a level must be impossible to miss, however you arrive at it.
  goal: { w: 30, h: 640 },
  crate: { w: 16, h: 16 },
  platformH: { w: 48, h: 12 },
  platformV: { w: 48, h: 12 },
};

const WALKER_SPEED = 0.45;
const FLYER_SPEED = 0.7;
const FLYER_AMPLITUDE = 22;
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
}

export function createEntities(level: Level): Entity[] {
  return level.entities.map((spawn) => ({
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    homeX: spawn.x,
    homeY: spawn.y,
    vx: spawn.kind === 'walker' ? -WALKER_SPEED : spawn.kind === 'flyer' ? -FLYER_SPEED : 0,
    vy: 0,
    t: 0,
    facing: -1,
    taken: false,
    triggered: false,
  }));
}

export function boxOf(entity: Entity): Box {
  const size = SIZES[entity.kind];
  return { x: entity.x - size.w / 2, y: entity.y - size.h / 2, w: size.w, h: size.h };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Advance one entity by a tick. Entities never collide with each other. */
export function updateEntity(entity: Entity, map: TileMap): void {
  entity.t += 1;
  if (entity.taken) return;

  switch (entity.kind) {
    case 'walker':
      patrol(entity, map);
      break;
    case 'flyer':
      hover(entity, map);
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
  if (isWallAt(map, next + Math.sign(entity.vx) * (SIZES.flyer.w / 2), entity.y)) {
    entity.vx = -entity.vx;
  } else {
    entity.x = next;
  }
  entity.facing = entity.vx < 0 ? -1 : 1;
  entity.y = entity.homeY + Math.sin(entity.t / 34) * FLYER_AMPLITUDE;
}

/** True when this kind hurts Roxy on contact from any direction. */
export function isHazard(kind: EntityKind): boolean {
  return kind === 'spike';
}

/** True when this kind can be bopped from above and hurts from the side. */
export function isEnemy(kind: EntityKind): boolean {
  return kind === 'walker' || kind === 'flyer';
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
