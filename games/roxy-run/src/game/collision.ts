/**
 * Tile collision with height masks.
 *
 * Every solid tile carries a 16-entry array of column heights measured up from
 * the tile's bottom edge, which is what lets ramps be real geometry instead of
 * staircases. Angles use screen coordinates (y grows downward), so a surface
 * rising to the right has a negative angle.
 *
 * Nothing here touches the DOM or any global - it is all pure functions over a
 * TileMap, which is what makes the feel testable.
 */

export const TILE = 16;

export interface TileShape {
  /** Solid height in pixels for each of the tile's 16 columns, from the bottom edge. */
  readonly heights: readonly number[];
  /** Surface angle in radians. atan2(dy, dx) in screen coords. */
  readonly angle: number;
  /** One-way platforms only stop a body falling onto them from above. */
  readonly oneWay: boolean;
  /** Full blocks stop horizontal movement; slopes are left to the floor sensors. */
  readonly isWall: boolean;
}

export interface TileMap {
  /** Width in tiles. */
  readonly width: number;
  /** Height in tiles. */
  readonly height: number;
  /** shapes index per tile, row-major, length width * height. 0 means empty. */
  readonly tiles: Uint8Array;
  /** Shape table. Index 0 must be the empty shape. */
  readonly shapes: readonly TileShape[];
}

export interface FloorHit {
  /** World y of the surface. */
  readonly y: number;
  /** Signed distance from the sensor to the surface. Negative means buried. */
  readonly distance: number;
  readonly angle: number;
}

const EMPTY_HEIGHTS = new Array<number>(TILE).fill(0);

export const EMPTY_SHAPE: TileShape = {
  heights: EMPTY_HEIGHTS,
  angle: 0,
  oneWay: false,
  isWall: false,
};

/**
 * How far below a surface a sensor may sit and still be counted as standing on
 * it. One tile: any deeper and the sensor belongs to the tile below.
 */
const MAX_BURIAL = TILE;

function shapeAt(map: TileMap, tx: number, ty: number): TileShape | null {
  if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return null;
  const id = map.tiles[ty * map.width + tx];
  if (id === undefined || id === 0) return null;
  return map.shapes[id] ?? null;
}

function columnOf(x: number): number {
  return ((Math.floor(x) % TILE) + TILE) % TILE;
}

/**
 * Cast a sensor downward from (x, y) looking for ground.
 *
 * `maxDistance` caps how far below the sensor a surface may be and still
 * count, which is what stops a body snapping down off a ledge.
 *
 * `stepUp` lets a grounded sensor also find ground *above* itself, which is
 * what allows a ramp to be climbed at all: a foot planted exactly on flat
 * ground would otherwise never see the slope rising in front of it, and the
 * player would walk into the hill as though it were a wall. Airborne callers
 * pass 0, so falling past a ledge never yanks the body up onto it.
 */
export function findFloor(
  map: TileMap,
  x: number,
  y: number,
  maxDistance: number,
  stepUp = 0,
  allowOneWay = true,
): FloorHit | null {
  if (x < 0 || x >= map.width * TILE) return null;

  const col = columnOf(x);
  const tx = Math.floor(x / TILE);
  const startTy = Math.floor(y / TILE);
  const firstTy = stepUp > 0 ? startTy - 1 : startTy;
  const lastTy = Math.floor((y + maxDistance) / TILE);

  // Top down, so the highest reachable surface wins - that is what makes a
  // body follow a slope up rather than staying on the flat beneath it.
  for (let ty = firstTy; ty <= lastTy; ty++) {
    const shape = shapeAt(map, tx, ty);
    if (!shape) continue;
    if (shape.oneWay && !allowOneWay) continue;

    const height = shape.heights[col] ?? 0;
    if (height <= 0) continue;

    const surfaceY = ty * TILE + (TILE - height);
    const distance = surfaceY - y;

    // Two different allowances, and conflating them lets a body climb walls:
    // within the sensor's own tile the sensor may simply be buried, but a
    // surface in the tile *above* may only be reached by stepping up, and that
    // is capped at roughly how far the body travels in a tick.
    const allowance = ty < startTy ? stepUp : MAX_BURIAL;
    if (distance < -allowance) continue;
    if (distance > maxDistance) return null;
    return { y: surfaceY, distance, angle: shape.angle };
  }
  return null;
}

/**
 * Find a ceiling that the head has run into.
 *
 * `y` is the head position *after* moving and `sweep` is how far it travelled
 * upward this tick, so a fast jump or a spring cannot skip straight through a
 * one-tile ceiling. Returns the underside's world y, or null for clear air.
 */
export function findCeiling(map: TileMap, x: number, y: number, sweep: number): number | null {
  if (x < 0 || x >= map.width * TILE) return null;

  const col = columnOf(x);
  const tx = Math.floor(x / TILE);
  const fromTy = Math.floor((y + Math.max(0, sweep)) / TILE);
  const toTy = Math.floor(y / TILE);

  // Walk from where the head was up to where it is, so the first ceiling along
  // the path wins rather than the last.
  for (let ty = fromTy; ty >= toTy; ty--) {
    const shape = shapeAt(map, tx, ty);
    if (!shape || shape.oneWay) continue;
    // Only full columns act as ceilings; the underside of a ramp is not solid.
    if ((shape.heights[col] ?? 0) < TILE) continue;

    const underside = (ty + 1) * TILE;
    if (underside >= y) return underside;
  }
  return null;
}

/** True when the point sits inside a tile that blocks horizontal movement. */
export function isWallAt(map: TileMap, x: number, y: number): boolean {
  if (x < 0 || x >= map.width * TILE) return true; // level edges are solid
  if (y < 0) return false;
  const shape = shapeAt(map, Math.floor(x / TILE), Math.floor(y / TILE));
  return shape !== null && shape.isWall;
}

/**
 * Push a body out of a wall horizontally.
 * Returns the corrected x, or the input x when nothing was hit.
 */
export function resolveWall(map: TileMap, x: number, y: number, radiusX: number, dir: number): number {
  if (dir === 0) return x;
  const probe = x + radiusX * Math.sign(dir);
  if (!isWallAt(map, probe, y)) return x;
  const tx = Math.floor(probe / TILE);
  return dir > 0 ? tx * TILE - radiusX : (tx + 1) * TILE + radiusX;
}
