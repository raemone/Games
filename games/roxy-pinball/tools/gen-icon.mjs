// The app icon: Roxy's face at 32x32, with a ball either side of her collar.
// Generated rather than drawn, so changing a number here repaints every size.
//
// Run with `npm run icon`. The PNGs it writes are committed, so a normal build
// and CI never run this.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from './png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, '..', 'public');

const SIZE = 32;
/** The face is centred between two pixels, which keeps it symmetric. */
const CX = 15.5;

const COLOURS = {
  bg: '#150c26',
  ear: '#8a5620',
  fur: '#d99a45',
  blaze: '#f2c268',
  muzzle: '#f7dfae',
  eye: '#241708',
  white: '#ffffff',
  nose: '#2b1b10',
  tongue: '#e8687a',
  collar: '#e8749c',
  tag: '#ffd88a',
  ballLight: '#f2f5fb',
  ballMid: '#aeb6c6',
  ballDark: '#5c6377',
};

/**
 * Half-widths, by row. Writing the head this way rather than as a circle is
 * what gives a Labrador its square skull and heavy jaw instead of a retriever's
 * neat oval.
 */
const HEAD = {
  4: 5, 5: 7, 6: 8, 7: 9, 8: 9, 9: 10, 10: 10, 11: 10, 12: 10,
  13: 10, 14: 10, 15: 9, 16: 9, 17: 9, 18: 8, 19: 8, 20: 7, 21: 6, 22: 5, 23: 3,
};

/** How far each ear sticks out past the head on that row. */
const EARS = {
  6: 2, 7: 3, 8: 4, 9: 5, 10: 5, 11: 5, 12: 5, 13: 5, 14: 4, 15: 4, 16: 3, 17: 2, 18: 1,
};

const BLAZE = { 5: 2, 6: 3, 7: 4, 8: 4, 9: 4, 10: 4, 11: 4, 12: 4, 13: 4, 14: 4, 15: 4 };
const MUZZLE = { 15: 5, 16: 6, 17: 6, 18: 6, 19: 5, 20: 4 };
const COLLAR = { 24: 7, 25: 7, 26: 6 };

const rgba = new Uint8Array(SIZE * SIZE * 4);

function parse(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function put(x, y, colour) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  rgba.set(parse(colour), (y * SIZE + x) * 4);
}

/** Fill the row `y` from `cx - half` to `cx + half - 1`, inclusive. */
function span(y, half, colour, cx = CX) {
  for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) put(x, y, colour);
}

function disc(cx, cy, radius, colour) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) put(x, y, colour);
    }
  }
}

for (let i = 0; i < SIZE * SIZE; i++) rgba.set(parse(COLOURS.bg), i * 4);

// Ears first, so the head overlaps them where they meet the skull.
for (const [row, out] of Object.entries(EARS)) {
  const y = Number(row);
  const head = HEAD[y] ?? 0;
  for (let i = 0; i < out; i++) {
    put(Math.ceil(CX - head - 1 - i), y, COLOURS.ear);
    put(Math.floor(CX + head + 1 + i), y, COLOURS.ear);
  }
}

for (const [row, half] of Object.entries(HEAD)) span(Number(row), half, COLOURS.fur);
for (const [row, half] of Object.entries(BLAZE)) span(Number(row), half, COLOURS.blaze);
for (const [row, half] of Object.entries(MUZZLE)) span(Number(row), half, COLOURS.muzzle);

// Eyes, with the highlight that decides whether she looks friendly or stuffed.
for (const side of [-1, 1]) {
  const x = CX + side * 4.5;
  disc(x, 11.5, 1.6, COLOURS.eye);
  put(Math.round(x - 0.5), 10, COLOURS.white);
}

span(16, 2, COLOURS.nose);
span(17, 1.5, COLOURS.nose);
put(15, 18, COLOURS.nose);
put(16, 18, COLOURS.nose);
span(19, 1, COLOURS.tongue);
span(20, 1, COLOURS.tongue);
span(21, 0.5, COLOURS.tongue);

for (const [row, half] of Object.entries(COLLAR)) span(Number(row), half, COLOURS.collar);
disc(CX, 27.5, 1.6, COLOURS.tag);

// A ball either side of the collar: the one thing that says pinball at 32px.
for (const cx of [4, 27]) {
  disc(cx, 26, 3.6, COLOURS.ballDark);
  disc(cx, 25.6, 2.8, COLOURS.ballMid);
  disc(cx - 0.9, 24.8, 1.4, COLOURS.ballLight);
}

/** Nearest-neighbour upscale, so the icon stays crisp at any launcher size. */
function upscale(source, size, factor) {
  const out = new Uint8Array(size * factor * size * factor * 4);
  const width = size * factor;
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const s = (Math.floor(y / factor) * size + Math.floor(x / factor)) * 4;
      out.set(source.subarray(s, s + 4), (y * width + x) * 4);
    }
  }
  return out;
}

mkdirSync(PUBLIC_DIR, { recursive: true });
for (const factor of [6, 18]) {
  const size = SIZE * factor;
  const path = join(PUBLIC_DIR, `icon-${size}.png`);
  writeFileSync(path, encodePng(size, size, upscale(rgba, SIZE, factor)));
  console.log(`  public/icon-${size}.png  ${size}x${size}`);
}
