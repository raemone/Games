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

/** How far above a sensor the collision code will look when the sensor is buried. */
const MAX_REGRESSION_TILES = 1;

function shapeAt(map: TileMap, tx: number, ty: number): TileShape | null {
  if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return null;
  const id = map.tiles[ty * map.width + tx];
  if (id === undefined || id === 0) return null;
  return map.shapes[id] ?? null;
}

/** Solid height of one tile column, 0 when there is nothing there. */
function columnHeight(map: TileMap, tx: number, ty: number, col: number): number {
  const shape = shapeAt(map, tx, ty);
  if (!shape) return 0;
  return shape.heights[col] ?? 0;
}

function columnOf(x: number): number {
  return ((Math.floor(x) % TILE) + TILE) % TILE;
}

/**
 * Cast a sensor downward from (x, y) looking for ground.
 *
 * `maxDistance` caps how far below the sensor a surface may be and still count,
 * which is what stops a body snapping down off a ledge.
 */
export function findFloor(
  map: TileMap,
  x: number,
  y: number,
  maxDistance: number,
  allowOneWay = true,
): FloorHit | null {
  if (x < 0 || x >= map.width * TILE) return null;

  const col = columnOf(x);
  const startTy = Math.floor(y / TILE);

  // The sensor's own tile first: the surface may be just below it, or the sensor
  // may already be buried in it.
  const here = shapeAt(map, Math.floor(x / TILE), startTy);
  if (here && (allowOneWay || !here.oneWay)) {
    const h = here.heights[col] ?? 0;
    if (h > 0) {
      const surfaceY = startTy * TILE + (TILE - h);
      if (surfaceY >= y) {
        return { y: surfaceY, distance: surfaceY - y, angle: here.angle };
      }
      // Buried. Walk up while the tile above is solid all the way through.
      return regressUp(map, x, startTy, col, y, allowOneWay);
    }
  }

  const tx = Math.floor(x / TILE);
  const lastTy = Math.floor((y + maxDistance) / TILE);
  for (let ty = startTy + 1; ty <= lastTy; ty++) {
    const shape = shapeAt(map, tx, ty);
    if (!shape) continue;
    if (shape.oneWay && !allowOneWay) continue;
    const h = shape.heights[col] ?? 0;
    if (h <= 0) continue;
    const surfaceY = ty * TILE + (TILE - h);
    const distance = surfaceY - y;
    if (distance > maxDistance) return null;
    return { y: surfaceY, distance, angle: shape.angle };
  }
  return null;
}

function regressUp(
  map: TileMap,
  x: number,
  startTy: number,
  col: number,
  sensorY: number,
  allowOneWay: boolean,
): FloorHit {
  const tx = Math.floor(x / TILE);
  let ty = startTy;
  for (let step = 0; step < MAX_REGRESSION_TILES; step++) {
    if (columnHeight(map, tx, ty - 1, col) < TILE) break;
    ty--;
  }
  const shape = shapeAt(map, tx, ty) ?? EMPTY_SHAPE;
  if (shape.oneWay && !allowOneWay) {
    return { y: sensorY, distance: 0, angle: 0 };
  }
  const h = shape.heights[col] ?? 0;
  const surfaceY = ty * TILE + (TILE - h);
  return { y: surfaceY, distance: surfaceY - sensorY, angle: shape.angle };
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
