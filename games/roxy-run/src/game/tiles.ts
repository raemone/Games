/**
 * The tile shape table every level shares.
 *
 * Shapes are built from height masks rather than typed out by hand, so a new
 * slope angle is one line rather than sixteen numbers.
 */
import { TILE, type TileShape } from './collision';

/** Build a shape whose surface runs linearly from `left` px high to `right` px high. */
function ramp(left: number, right: number, oneWay = false): TileShape {
  const heights: number[] = [];
  for (let col = 0; col < TILE; col++) {
    // Sample the middle of each column so a 0->16 ramp comes out symmetric.
    const t = (col + 0.5) / TILE;
    heights.push(Math.round(left + (right - left) * t));
  }
  // Screen coords: y grows downward, so a surface that gets taller to the right
  // is rising, which is a negative angle.
  // The trailing '+ 0' normalises the -0 that atan2 returns for a flat surface,
  // which would otherwise leak a negative zero into every angle comparison.
  const angle = Math.atan2(-(right - left), TILE) + 0;
  return {
    heights,
    angle,
    oneWay,
    isWall: left >= TILE && right >= TILE && !oneWay,
  };
}

function flat(height: number, oneWay = false): TileShape {
  return ramp(height, height, oneWay);
}

/**
 * Shape ids. Index 0 is empty and must stay that way - collision treats 0 as
 * "nothing here" without a table lookup.
 */
export const SHAPES: readonly TileShape[] = [
  /* 0 */ { heights: new Array<number>(TILE).fill(0), angle: 0, oneWay: false, isWall: false },
  /* 1 */ flat(16), // solid block
  /* 2 */ ramp(0, 16), // 45 deg rising to the right
  /* 3 */ ramp(16, 0), // 45 deg falling to the right
  /* 4 */ ramp(0, 8), // 22.5 deg rising, lower half
  /* 5 */ ramp(8, 16), // 22.5 deg rising, upper half
  /* 6 */ ramp(16, 8), // 22.5 deg falling, upper half
  /* 7 */ ramp(8, 0), // 22.5 deg falling, lower half
  /* 8 */ flat(8), // half-height ledge
  /* 9 */ flat(16, true), // one-way platform
  /* 10 */ flat(4), // shallow lip
];

/**
 * Level ASCII characters mapped to shape ids.
 *
 * Deliberately no backslash: level maps are TypeScript string literals, and a
 * character that needs escaping in every row is a bug waiting to happen. `/`
 * rises and `L` lowers; `a`/`b` and `c`/`d` are the two halves of the gentle
 * slopes, read left to right.
 */
/** Shape id of the one-way platform. You can see under it, so it buries nothing. */
export const ONE_WAY_SHAPE = 9;

export const TILE_CHARS: Readonly<Record<string, number>> = {
  '#': 1,
  '/': 2,
  L: 3,
  a: 4,
  b: 5,
  c: 6,
  d: 7,
  _: 8,
  '=': 9,
  '-': 10,
};

/** Ice and sand change how much grip a surface has; set per world. */
export interface SurfaceFeel {
  /** Multiplier on friction and deceleration. Ice below 1, sand above 1. */
  readonly grip: number;
  /** Multiplier on acceleration. */
  readonly bite: number;
}

export const DEFAULT_FEEL: SurfaceFeel = { grip: 1, bite: 1 };
