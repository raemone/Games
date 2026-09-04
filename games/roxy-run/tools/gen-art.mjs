// Generates every PNG the game uses from the pixel data in this folder.
// Run with `npm run art`. Output is committed, so a normal build never runs this.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blit, encodePng, rowsToRgba } from './png.mjs';
import { PAL } from './palette.mjs';
import { roxyIcon, upscale } from './icon.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, '..', 'public');

const ICON_BG = [0x2a, 0x1b, 0x4a, 0xff];

function write(path, width, height, rgba) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(width, height, rgba));
  console.log(`  ${path.replace(join(here, '..'), '.')}  ${width}x${height}`);
}

function buildIcons() {
  // 48x48 base: solid background with the 32x32 face inset, which keeps the dog
  // inside the safe zone Android uses when it masks the icon into a circle.
  const base = 48;
  const canvas = new Uint8Array(base * base * 4);
  for (let i = 0; i < base * base; i++) {
    canvas.set(ICON_BG, i * 4);
  }

  const face = rowsToRgba(roxyIcon(), PAL);
  blit(canvas, base, face.rgba, face.width, face.height, 8, 8);

  for (const factor of [4, 12]) {
    const size = base * factor;
    write(join(PUBLIC_DIR, `icon-${size}.png`), size, size, upscale(canvas, base, base, factor));
  }
}

console.log('Generating art…');
buildIcons();
console.log('Done.');
