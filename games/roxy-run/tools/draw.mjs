// A tiny pixel-art drawing kit: a character grid you paint into, plus an
// outline pass. Composing sprites from shapes rather than hand-typing every
// pixel is what makes a 30-frame animation practical to author and to tweak.

export class Grid {
  constructor(width, height, fill = '.') {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(fill);
  }

  inside(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  set(x, y, ch) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (!this.inside(px, py)) return;
    this.cells[py * this.width + px] = ch;
  }

  get(x, y) {
    if (!this.inside(x, y)) return '.';
    return this.cells[y * this.width + x];
  }

  /** Paint only where the pixel is currently empty - keeps earlier parts on top. */
  under(x, y, ch) {
    if (this.get(Math.round(x), Math.round(y)) === '.') this.set(x, y, ch);
  }

  rect(x, y, w, h, ch) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
    }
  }

  ellipse(cx, cy, rx, ry, ch) {
    if (rx <= 0 || ry <= 0) return;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, ch);
      }
    }
  }

  /** A capsule between two points - the workhorse for limbs and tails. */
  capsule(x0, y0, x1, y1, radius, ch) {
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, radius, ch);
    }
  }

  /** Recolour every pixel currently matching `from`. */
  recolour(from, to) {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === from) this.cells[i] = to;
    }
  }

  /**
   * Surround the silhouette with `ch`. This single pass is what makes the
   * shapes read as deliberate pixel art rather than as blobs.
   */
  outline(ch = 'o') {
    const added = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== '.') continue;
        const touching =
          this.solid(x - 1, y) || this.solid(x + 1, y) || this.solid(x, y - 1) || this.solid(x, y + 1);
        if (touching) added.push([x, y]);
      }
    }
    for (const [x, y] of added) this.set(x, y, ch);
  }

  solid(x, y) {
    const cell = this.get(x, y);
    return cell !== '.' && cell !== 'o';
  }

  /** Shade the underside of the silhouette, for a cheap sense of volume. */
  shadeBelow(bodyCh, shadowCh, depth = 2) {
    for (let x = 0; x < this.width; x++) {
      let run = 0;
      for (let y = this.height - 1; y >= 0; y--) {
        if (this.get(x, y) === bodyCh) {
          if (run < depth) this.set(x, y, shadowCh);
          run++;
        } else if (this.get(x, y) === '.') {
          run = 0;
        }
      }
    }
  }

  rows() {
    const out = [];
    for (let y = 0; y < this.height; y++) {
      out.push(this.cells.slice(y * this.width, (y + 1) * this.width).join(''));
    }
    return out;
  }

  /**
   * Stamp hand-authored rows of palette keys into the grid at (dx, dy).
   * Shape functions are the right tool for anything organic, but a small
   * symmetric object like a bone needs exact control of every pixel.
   */
  stamp(rows, dx, dy) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const cell = row[x];
        // Both '.' and ' ' mean empty. Level segments use spaces and sprite
        // rows use dots; treating only one as blank leaves the other sitting
        // in the grid as an invisible solid, which the outline pass then draws
        // a box around.
        if (cell !== '.' && cell !== ' ') this.set(dx + x, dy + y, cell);
      }
    }
  }

  /** Copy this grid into another, mirrored horizontally if asked. */
  blitInto(target, dx, dy, flip = false) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.get(x, y);
        if (cell === '.') continue;
        target.set(dx + (flip ? this.width - 1 - x : x), dy + y, cell);
      }
    }
  }
}
