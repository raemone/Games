// Roxy's face, 32x32. Built as left-ear + head + right-ear so the ear shape is
// written once and the head rows only describe what is actually inside the head.
const HEAD_W = 16;

// Rows of the head interior, keyed by y. Anything not listed is solid mid-gold.
const HEAD_ROWS = {
  10: 'MMMoo' + 'MMMMMM' + 'ooMMM',
  11: 'MMM' + 'WE' + 'MMMMMM' + 'WE' + 'MMM',
  12: 'MMM' + 'EE' + 'MMMMMM' + 'EE' + 'MMM',
  13: 'MMMM' + 'CCCCCCCC' + 'MMMM',
  14: 'MMM' + 'CCC' + 'NNNN' + 'CCC' + 'MMM',
  15: 'MMM' + 'CCC' + 'NNNN' + 'CCC' + 'MMM',
  16: 'MMM' + 'CCCC' + 'NN' + 'CCCC' + 'MMM',
  17: 'MMM' + 'CCCC' + 'oo' + 'CCCC' + 'MMM',
  18: 'MMM' + 'CC' + 'oo' + 'CC' + 'oo' + 'CC' + 'MMM',
  19: 'MMM' + 'CCCC' + 'TT' + 'CCCC' + 'MMM',
  20: 'MMMM' + 'CCC' + 'TT' + 'CCC' + 'MMMM',
  21: 'MMMMM' + 'CCCCCC' + 'MMMMM',
};

// Left-ear segment for each y (the right ear is its mirror). '' means no ear yet.
const EARS = {
  7: 'oDD',
  8: 'oDDD',
  9: 'oDDD',
  10: 'oDDD',
  11: 'oDDD',
  12: 'oDDD',
  13: 'oDDD',
  14: 'oDDD',
  15: 'oDDD',
  16: 'oDDD',
  17: 'oDDD',
  18: 'oDDD',
  19: 'oDD',
  20: 'oD',
  21: 'o',
};

function mirror(s) {
  return [...s].reverse().join('');
}

function pad(row) {
  const gap = 32 - row.length;
  if (gap < 0) throw new Error(`row too long (${row.length}): ${row}`);
  const left = Math.floor(gap / 2);
  return '.'.repeat(left) + row + '.'.repeat(gap - left);
}

export function roxyIcon() {
  const rows = [];
  for (let y = 0; y < 32; y++) {
    if (y < 3 || y > 27) {
      rows.push('.'.repeat(32));
      continue;
    }
    if (y === 3) {
      rows.push(pad('o'.repeat(10)));
      continue;
    }
    if (y === 4) {
      rows.push(pad('oo' + 'M'.repeat(10) + 'oo'));
      continue;
    }
    if (y === 5) {
      rows.push(pad('o' + 'M'.repeat(14) + 'o'));
      continue;
    }
    if (y === 6) {
      rows.push(pad('o' + 'M'.repeat(16) + 'o'));
      continue;
    }
    if (y === 23) {
      rows.push(pad('o' + 'M'.repeat(14) + 'o'));
      continue;
    }
    if (y === 24) {
      rows.push(pad('o' + 'R'.repeat(14) + 'o'));
      continue;
    }
    if (y === 25) {
      rows.push(pad('o' + 'R'.repeat(6) + 'YY' + 'R'.repeat(6) + 'o'));
      continue;
    }
    if (y === 26) {
      rows.push(pad('o' + 'R'.repeat(12) + 'o'));
      continue;
    }
    if (y === 27) {
      rows.push(pad('o'.repeat(14)));
      continue;
    }

    const inner = HEAD_ROWS[y] ?? 'M'.repeat(HEAD_W);
    if (inner.length !== HEAD_W) {
      throw new Error(`head row ${y} is ${inner.length} wide, expected ${HEAD_W}`);
    }
    const ear = EARS[y] ?? '';
    rows.push(pad(ear + 'o' + inner + 'o' + mirror(ear)));
  }
  return rows;
}

/** Nearest-neighbour upscale so icons stay crisp at any launcher size. */
export function upscale(rgba, w, h, factor) {
  const out = new Uint8Array(w * factor * h * factor * 4);
  const outW = w * factor;
  for (let y = 0; y < h * factor; y++) {
    for (let x = 0; x < outW; x++) {
      const s = (Math.floor(y / factor) * w + Math.floor(x / factor)) * 4;
      const d = (y * outW + x) * 4;
      out[d] = rgba[s];
      out[d + 1] = rgba[s + 1];
      out[d + 2] = rgba[s + 2];
      out[d + 3] = rgba[s + 3];
    }
  }
  return out;
}
