// Minimal PNG writer. Node's zlib does the compression; we just frame the chunks.
// Zero dependencies on purpose - the art pipeline should never break on an npm install.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode straight RGBA pixels as a PNG.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba - width * height * 4 bytes
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`expected ${expected} bytes of RGBA, got ${rgba.length}`);
  }

  // Each scanline is prefixed with a filter byte; 0 = none. Pixel art compresses
  // well enough without per-line filter heuristics.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + src, width * 4).copy(raw, dst + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Build an RGBA buffer from rows of palette keys.
 * A key of '.' (or any key missing from the palette) is transparent.
 * @param {string[]} rows - each row is a string of single-character palette keys
 * @param {Record<string, string>} palette - key -> '#rrggbb' or '#rrggbbaa'
 * @returns {{ width: number, height: number, rgba: Uint8Array }}
 */
export function rowsToRgba(rows, palette) {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const rgba = new Uint8Array(width * height * 4);

  const resolved = new Map();
  for (const [key, hex] of Object.entries(palette)) resolved.set(key, parseHex(hex));

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (row.length !== width) {
      throw new Error(`row ${y} is ${row.length} chars, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const colour = resolved.get(row[x]);
      if (!colour) continue; // transparent
      const i = (y * width + x) * 4;
      rgba[i] = colour[0];
      rgba[i + 1] = colour[1];
      rgba[i + 2] = colour[2];
      rgba[i + 3] = colour[3];
    }
  }

  return { width, height, rgba };
}

/** Blit one RGBA image into another at (dx, dy), respecting alpha as a straight copy. */
export function blit(dest, destW, src, srcW, srcH, dx, dy) {
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const s = (y * srcW + x) * 4;
      if (src[s + 3] === 0) continue;
      const d = ((dy + y) * destW + (dx + x)) * 4;
      dest[d] = src[s];
      dest[d + 1] = src[s + 1];
      dest[d + 2] = src[s + 2];
      dest[d + 3] = src[s + 3];
    }
  }
}

function parseHex(hex) {
  const h = hex.replace('#', '');
  if (h.length !== 6 && h.length !== 8) throw new Error(`bad colour: ${hex}`);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255,
  ];
}
