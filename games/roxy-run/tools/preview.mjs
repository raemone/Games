// Dev helper: upscale a generated PNG onto a checkerboard so sprites can be
// eyeballed at a sane size. Not part of the build.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { encodePng } from './png.mjs';
import { upscale } from './icon.mjs';

const [, , input, output, factorArg] = process.argv;
const factor = Number(factorArg ?? 3);

const buf = readFileSync(input);
let p = 8;
let width = 0;
let height = 0;
const idat = [];
while (p < buf.length) {
  const len = buf.readUInt32BE(p);
  const type = buf.toString('ascii', p + 4, p + 8);
  if (type === 'IHDR') {
    width = buf.readUInt32BE(p + 8);
    height = buf.readUInt32BE(p + 12);
  }
  if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
  p += 12 + len;
}

const raw = inflateSync(Buffer.concat(idat));
const rgba = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) {
  raw.copy(rgba, y * width * 4, y * (1 + width * 4) + 1, (y + 1) * (1 + width * 4));
}
for (let i = 0; i < width * height; i++) {
  if (rgba[i * 4 + 3] !== 0) continue;
  const x = i % width;
  const y = Math.floor(i / width);
  const shade = ((x >> 3) + (y >> 3)) % 2 ? 60 : 40;
  rgba[i * 4] = shade;
  rgba[i * 4 + 1] = shade;
  rgba[i * 4 + 2] = shade + 12;
  rgba[i * 4 + 3] = 255;
}

writeFileSync(
  output,
  encodePng(width * factor, height * factor, upscale(rgba, width, height, factor)),
);
console.log(`${output} ${width * factor}x${height * factor}`);
