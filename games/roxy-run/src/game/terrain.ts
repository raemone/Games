/**
 * Tile art is painted at load time from the very same height masks the
 * collision code uses, which means the picture can never drift from the
 * geometry - a ramp you can see is exactly a ramp you can stand on.
 *
 * Two variants are produced per shape: a surface one with a grass/snow/sand
 * cap, and a buried one that is all body, used when there is solid tile above.
 */
import { TILE } from './collision';
import { SHAPES } from './tiles';
import type { Theme } from './theme';

/** Thickness of the coloured cap on an exposed surface. */
const CAP_DEPTH = 4;

export interface Tileset {
  readonly canvas: HTMLCanvasElement;
  /** Row 0 is the exposed surface variant, row 1 is buried. */
  readonly cellSize: number;
}

/**
 * Deterministic speckle noise. A real random() would make the ground shimmer
 * differently every time the level loads.
 */
function speckle(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function buildTileset(theme: Theme): Tileset {
  const canvas = document.createElement('canvas');
  canvas.width = SHAPES.length * TILE;
  canvas.height = 2 * TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available in this browser');

  SHAPES.forEach((shape, id) => {
    if (id === 0) return;
    for (let variant = 0; variant < 2; variant++) {
      const originX = id * TILE;
      const originY = variant * TILE;
      const buried = variant === 1;

      for (let col = 0; col < TILE; col++) {
        const height = shape.heights[col] ?? 0;
        if (height <= 0) continue;
        const surfaceY = TILE - height;

        for (let row = surfaceY; row < TILE; row++) {
          const depth = row - surfaceY;
          let colour: string;
          if (!buried && depth < CAP_DEPTH) {
            colour = theme.ground.top;
          } else if (speckle(col + id * 16, row + variant * 16) > 0.86) {
            colour = theme.ground.deep;
          } else {
            colour = theme.ground.body;
          }
          ctx.fillStyle = colour;
          ctx.fillRect(originX + col, originY + row, 1, 1);
        }

        // A darker lip under the cap gives the surface a readable edge.
        if (!buried) {
          ctx.fillStyle = theme.ground.deep;
          ctx.fillRect(originX + col, originY + surfaceY + CAP_DEPTH, 1, 1);
        }
      }
    }
  });

  return { canvas, cellSize: TILE };
}
