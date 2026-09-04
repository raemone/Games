// Dev helper: crop single frames out of a sheet and blow them up, so a sprite
// can actually be judged. Not part of the build.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { encodePng } from './png.mjs';

const [, , input, output, cellArg, factorArg, cellsArg] = process.argv;
const cell = Number(cellArg ?? 32);
const factor = Number(factorArg ?? 10);
// "col,row col,row ..." laid out left to right in the output.
const cells = (cellsArg ?? '0,0').split(' ').map((pair) => pair.split(',').map(Number));

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
const src = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) {
  raw.copy(src, y * width * 4, y * (1 + width * 4) + 1, (y + 1) * (1 + width * 4));
}

const outW = cells.length * cell * factor;
const outH = cell * factor;
const out = Buffer.alloc(outW * outH * 4);

for (let i = 0; i < cells.length; i++) {
  const [cx, cy] = cells[i];
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < cell * factor; x++) {
      const sx = cx * cell + Math.floor(x / factor);
      const sy = cy * cell + Math.floor(y / factor);
      const s = (sy * width + sx) * 4;
      const d = (y * outW + i * cell * factor + x) * 4;
      if (src[s + 3] === 0) {
        const shade = ((x >> 4) + (y >> 4)) % 2 ? 64 : 44;
        out[d] = shade;
        out[d + 1] = shade;
        out[d + 2] = shade + 12;
        out[d + 3] = 255;
        continue;
      }
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = 255;
    }
  }
}

writeFileSync(output, encodePng(outW, outH, out));
console.log(`${output} ${outW}x${outH}`);
