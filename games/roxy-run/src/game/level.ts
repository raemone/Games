/**
 * Levels are authored as ASCII art: one character per 16px tile, top row first.
 *
 * Keeping them as plain strings means a level is editable in any text editor
 * and diffs readably in git, which matters far more here than the few bytes a
 * binary format would save.
 */
import { TILE, type TileMap } from './collision';
import { SHAPES, TILE_CHARS, type SurfaceFeel } from './tiles';

export type EntityKind =
  | 'bone'
  | 'spring'
  | 'springLeft'
  | 'springRight'
  | 'boost'
  | 'walker'
  | 'flyer'
  | 'pigeon'
  | 'falcon'
  | 'spike'
  | 'checkpoint'
  | 'goal'
  | 'crate'
  | 'platformH'
  | 'platformV'
  | 'star';

/** Characters that spawn an entity rather than a tile. The tile stays empty. */
export const ENTITY_CHARS: Readonly<Record<string, EntityKind>> = {
  o: 'bone',
  S: 'spring',
  '<': 'springLeft',
  '>': 'springRight',
  '~': 'boost',
  E: 'walker',
  V: 'flyer',
  // 'p' and 'P' are a keystroke apart, but a slip either way is caught: two
  // spawns is an error, and none is too.
  p: 'pigeon',
  F: 'falcon',
  '^': 'spike',
  C: 'checkpoint',
  G: 'goal',
  X: 'crate',
  H: 'platformH',
  I: 'platformV',
  '*': 'star',
};

/** Roxy's start position. */
const SPAWN_CHAR = 'P';
/** Blank space. Both are accepted so trailing rows can be padded either way. */
const EMPTY_CHARS = new Set([' ', '.']);

export interface EntitySpawn {
  readonly kind: EntityKind;
  /** World pixel coordinates of the tile's centre. */
  readonly x: number;
  readonly y: number;
}

export interface LevelDef {
  readonly id: string;
  readonly name: string;
  readonly world: number;
  /** Seconds before the level is failed. */
  readonly timeLimit: number;
  /**
   * Pixels per tick for a thing that chases the player from the left, or
   * undefined for a level with no chase. Each world's last level uses it.
   */
  readonly chase?: number;
  readonly rows: readonly string[];
}

export interface Level {
  readonly def: LevelDef;
  readonly map: TileMap;
  readonly spawn: { readonly x: number; readonly y: number };
  readonly entities: readonly EntitySpawn[];
  /** World pixel bounds. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export class LevelError extends Error {}

/**
 * Turn a level definition into a playable map.
 * Throws LevelError on malformed data - a level that cannot be finished is a
 * bug worth failing the build over, not something to paper over at runtime.
 */
export function parseLevel(def: LevelDef): Level {
  const rows = def.rows;
  if (rows.length === 0) throw new LevelError(`${def.id}: level has no rows`);

  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const tiles = new Uint8Array(width * height);
  const entities: EntitySpawn[] = [];
  let spawn: { x: number; y: number } | null = null;
  let goalSeen = false;

  for (let ty = 0; ty < height; ty++) {
    const row = rows[ty] ?? '';
    for (let tx = 0; tx < width; tx++) {
      // Rows may be short; the remainder is empty space.
      const ch = tx < row.length ? (row[tx] as string) : ' ';
      if (EMPTY_CHARS.has(ch)) continue;

      const shapeId = TILE_CHARS[ch];
      if (shapeId !== undefined) {
        tiles[ty * width + tx] = shapeId;
        continue;
      }

      const kind = ENTITY_CHARS[ch];
      if (kind !== undefined) {
        entities.push({ kind, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
        if (kind === 'goal') goalSeen = true;
        continue;
      }

      if (ch === SPAWN_CHAR) {
        if (spawn) throw new LevelError(`${def.id}: more than one spawn point`);
        spawn = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
        continue;
      }

      throw new LevelError(`${def.id}: unknown character '${ch}' at row ${ty}, column ${tx}`);
    }
  }

  if (!spawn) throw new LevelError(`${def.id}: no spawn point ('${SPAWN_CHAR}')`);
  if (!goalSeen) throw new LevelError(`${def.id}: no goal ('G')`);

  return {
    def,
    map: { width, height, tiles, shapes: SHAPES },
    spawn,
    entities,
    pixelWidth: width * TILE,
    pixelHeight: height * TILE,
  };
}

export interface WorldTheme {
  readonly id: number;
  readonly name: string;
  readonly feel: SurfaceFeel;
  /** Sky gradient, top to bottom. */
  readonly sky: readonly [string, string];
  /** Tint applied to the shared tile art. */
  readonly ground: { readonly top: string; readonly body: string; readonly deep: string };
  readonly accent: string;
}
