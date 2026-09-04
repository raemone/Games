import { TILE, type TileMap } from '../src/game/collision';
import { SHAPES, TILE_CHARS } from '../src/game/tiles';
import type { PhysicsInput } from '../src/game/physics';

/** Build a bare TileMap from ASCII rows, ignoring entity characters. */
export function tileMap(rows: string[]): TileMap {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const tiles = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    const row = rows[ty] ?? '';
    for (let tx = 0; tx < row.length; tx++) {
      const id = TILE_CHARS[row[tx] as string];
      if (id !== undefined) tiles[ty * width + tx] = id;
    }
  }
  return { width, height, tiles, shapes: SHAPES };
}

export const NO_INPUT: PhysicsInput = {
  left: false,
  right: false,
  down: false,
  jumpHeld: false,
  jumpPressed: false,
};

export function input(overrides: Partial<PhysicsInput>): PhysicsInput {
  return { ...NO_INPUT, ...overrides };
}

/** World y of the top of tile row `ty`. */
export function rowTop(ty: number): number {
  return ty * TILE;
}
