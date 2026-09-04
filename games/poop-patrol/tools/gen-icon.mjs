// The app icon: a smiling soft-serve swirl, generated rather than drawn, so
// changing a number here repaints every size.
//
// Run with `npm run icon`. The PNGs it writes are committed, so a normal build
// and CI never run this.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blit, encodePng, rowsToRgba } from './png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, '..', 'public');

const SIZE = 32;
const CENTER = 16;

const PALETTE = {
  o: '#3a2412', // outline
  D: '#6b4423', // shadow side
  M: '#8b5a2b', // body
  L: '#a9713a', // lit side
  W: '#ffffff', // eye white
  E: '#241708', // pupils and smile
};

// The background the icon sits on: the top colour of the page's own gradient,
// which is the choice Roxy Run's icon makes too.
const BACKGROUND = [42, 27, 74, 255];

// Half-width of the swirl at each row. The two dips are the pinches between
// the three tiers, which is what makes it read as a swirl rather than a blob.
const HALF_WIDTH = {
  4: 2,
  5: 3,
  6: 4,
  7: 5,
  8: 6,
  9: 6,
  10: 7,
  11: 7,
  12: 7,
  13: 7,
  14: 6,
  15: 6,
  16: 8,
  17: 9,
  18: 10,
  19: 10,
  20: 10,
  21: 10,
  22: 9,
  23: 9,
  24: 10,
  25: 11,
  26: 12,
  27: 13,
  28: 13,
  29: 13,
  30: 12,
};

// [y, x] cells drawn on top of the body once it is shaded.
const EYE_WHITES = [
  [9, 11],
  [9, 12],
  [10, 11],
  [10, 12],
  [11, 11],
  [11, 12],
  [9, 19],
  [9, 20],
  [10, 19],
  [10, 20],
  [11, 19],
  [11, 20],
];
// Pupils on the inner edge, so the two of them are looking at each other.
const PUPILS = [
  [10, 12],
  [10, 19],
];
// Corners a row higher than the middle, which is what makes it a smile.
const SMILE = [
  [13, 12],
  [14, 13],
  [14, 14],
  [14, 15],
  [14, 16],
  [14, 17],
  [14, 18],
  [13, 19],
];

function buildSwirl() {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));

  for (const [row, half] of Object.entries(HALF_WIDTH)) {
    const y = Number(row);
    const left = CENTER - half;
    const span = half * 2;
    for (let x = left; x < left + span; x++) {
      const t = (x - left) / (span - 1);
      grid[y][x] = t < 0.07 || t > 0.93 ? 'o' : t < 0.3 ? 'L' : t > 0.78 ? 'D' : 'M';
    }
  }

  // Outline wherever the body meets empty space above or below, so every tier
  // keeps its own edge instead of melting into the one beneath it.
  const filled = grid.map((row) => row.map((cell) => cell !== '.'));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!filled[y][x]) continue;
      const above = y > 0 && filled[y - 1][x];
      const below = y < SIZE - 1 && filled[y + 1][x];
      if (!above || !below) grid[y][x] = 'o';
    }
  }

  for (const [y, x] of EYE_WHITES) grid[y][x] = 'W';
  for (const [y, x] of PUPILS) grid[y][x] = 'E';
  for (const [y, x] of SMILE) grid[y][x] = 'E';

  return grid.map((row, y) => {
    const line = row.join('');
    if (line.length !== SIZE) throw new Error(`row ${y} is ${line.length} wide, expected ${SIZE}`);
    return line;
  });
}

/** Nearest-neighbour upscale, so the icon stays crisp at any launcher size. */
function upscale(rgba, width, height, factor) {
  const outWidth = width * factor;
  const out = new Uint8Array(outWidth * height * factor * 4);
  for (let y = 0; y < height * factor; y++) {
    for (let x = 0; x < outWidth; x++) {
      const source = (Math.floor(y / factor) * width + Math.floor(x / factor)) * 4;
      const dest = (y * outWidth + x) * 4;
      out[dest] = rgba[source];
      out[dest + 1] = rgba[source + 1];
      out[dest + 2] = rgba[source + 2];
      out[dest + 3] = rgba[source + 3];
    }
  }
  return out;
}

function build() {
  // A 48x48 base with the 32x32 swirl inset by 8, which keeps it inside the
  // safe zone Android uses when it masks an icon into a circle.
  const base = 48;
  const canvas = new Uint8Array(base * base * 4);
  for (let i = 0; i < base * base; i++) canvas.set(BACKGROUND, i * 4);

  const swirl = rowsToRgba(buildSwirl(), PALETTE);
  blit(canvas, base, swirl.rgba, swirl.width, swirl.height, 8, 8);

  mkdirSync(PUBLIC_DIR, { recursive: true });
  for (const factor of [4, 12]) {
    const size = base * factor;
    const path = join(PUBLIC_DIR, `icon-${size}.png`);
    writeFileSync(path, encodePng(size, size, upscale(canvas, base, base, factor)));
    console.log(`wrote ${path}`);
  }
}

build();
