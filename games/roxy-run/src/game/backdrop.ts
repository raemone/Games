/**
 * Parallax backdrops.
 *
 * Each world gets several layers painted once at load into their own canvases,
 * then scrolled at different rates. Everything is drawn from a seeded
 * pseudo-random sequence rather than Math.random, so a level looks identical
 * every time it is played - scenery that reshuffles on each attempt reads as a
 * glitch.
 *
 * Layers are exactly one screen wide so tiling them is a plain repeat, and
 * every element is painted three times (at x, x - width and x + width) so
 * nothing is clipped at the seam.
 */
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../engine/renderer';
import type { Theme } from './theme';

const LAYER_WIDTH = VIRTUAL_WIDTH;
const LAYER_HEIGHT = 180;

export interface BackdropLayer {
  readonly canvas: HTMLCanvasElement;
  /** Fraction of the camera's horizontal movement this layer scrolls by. */
  readonly factor: number;
  /** Pixels to shift the layer down; negative sits it higher up the sky. */
  readonly offsetY: number;
  readonly alpha: number;
}

export interface Sun {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly colour: string;
  readonly glow: string;
}

export interface Backdrop {
  readonly layers: readonly BackdropLayer[];
  readonly sun: Sun;
  /** Drifting flecks - snow, blossom or sea spray - or none. */
  readonly flecks: { readonly colour: string; readonly count: number; readonly drift: number } | null;
}

/** Deterministic PRNG, so scenery is the same on every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layerCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = LAYER_WIDTH;
  canvas.height = LAYER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available in this browser');
  return { canvas, ctx };
}

/** Run `paint` at x and at both wrapped positions, so the seam is invisible. */
function wrapped(x: number, paint: (x: number) => void): void {
  paint(x);
  paint(x - LAYER_WIDTH);
  paint(x + LAYER_WIDTH);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A soft cumulus made of overlapping lobes. */
function paintClouds(
  ctx: CanvasRenderingContext2D,
  colour: string,
  count: number,
  seed: number,
  stretch = 1,
): void {
  const rand = seeded(seed);
  ctx.fillStyle = colour;
  for (let i = 0; i < count; i++) {
    const x = rand() * LAYER_WIDTH;
    const y = 20 + rand() * 60;
    const scale = 0.7 + rand() * 0.8;
    wrapped(x, (cx) => {
      for (let lobe = 0; lobe < 5; lobe++) {
        const lx = cx + (lobe - 2) * 11 * scale * stretch;
        const ly = y + Math.sin(lobe * 1.3) * 3 * scale;
        circle(ctx, lx, ly, (10 - Math.abs(lobe - 2) * 2.2) * scale);
      }
      ctx.fillRect(cx - 24 * scale * stretch, y, 48 * scale * stretch, 8 * scale);
    });
  }
}

/** A run of rounded hills along the bottom of a layer. */
function paintHills(
  ctx: CanvasRenderingContext2D,
  colour: string,
  amplitude: number,
  spacing: number,
  seed: number,
): void {
  const rand = seeded(seed);
  ctx.fillStyle = colour;
  for (let x = -spacing; x < LAYER_WIDTH + spacing; x += spacing) {
    const h = amplitude * (0.6 + rand() * 0.7);
    ctx.beginPath();
    ctx.ellipse(x, LAYER_HEIGHT, spacing * 0.85, h, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillRect(0, LAYER_HEIGHT - 6, LAYER_WIDTH, 6);
}

/** Broad-leaved trees with trunks and layered canopies. */
function paintTrees(
  ctx: CanvasRenderingContext2D,
  trunk: string,
  canopy: string,
  highlight: string,
  spacing: number,
  scale: number,
  seed: number,
): void {
  const rand = seeded(seed);
  for (let x = 0; x < LAYER_WIDTH; x += spacing) {
    const jitter = (rand() - 0.5) * spacing * 0.5;
    const size = (0.8 + rand() * 0.5) * scale;
    const base = LAYER_HEIGHT - 2;
    wrapped(x + jitter, (tx) => {
      ctx.fillStyle = trunk;
      ctx.fillRect(tx - 2 * size, base - 26 * size, 4 * size, 26 * size);
      ctx.fillStyle = canopy;
      circle(ctx, tx, base - 34 * size, 13 * size);
      circle(ctx, tx - 10 * size, base - 27 * size, 9 * size);
      circle(ctx, tx + 10 * size, base - 27 * size, 9 * size);
      // A lit crown on the sun side gives the mass some shape.
      ctx.fillStyle = highlight;
      circle(ctx, tx + 4 * size, base - 39 * size, 7 * size);
    });
  }
}

/** Low bushes and flower dots to break up a bare foreground. */
function paintUndergrowth(
  ctx: CanvasRenderingContext2D,
  bush: string,
  bloom: string,
  seed: number,
): void {
  const rand = seeded(seed);
  for (let i = 0; i < 26; i++) {
    const x = rand() * LAYER_WIDTH;
    const r = 4 + rand() * 6;
    wrapped(x, (bx) => {
      ctx.fillStyle = bush;
      circle(ctx, bx, LAYER_HEIGHT - 2, r);
      circle(ctx, bx + r * 0.7, LAYER_HEIGHT - 1, r * 0.7);
      ctx.fillStyle = bloom;
      circle(ctx, bx - r * 0.4, LAYER_HEIGHT - r * 0.9, 1.4);
    });
  }
}

/** A jagged range with snow on the tops. */
function paintMountains(
  ctx: CanvasRenderingContext2D,
  rock: string,
  shade: string,
  snow: string,
  spacing: number,
  height: number,
  seed: number,
): void {
  const rand = seeded(seed);
  for (let x = -spacing; x < LAYER_WIDTH + spacing; x += spacing) {
    const peak = height * (0.7 + rand() * 0.6);
    const half = spacing * (0.6 + rand() * 0.3);
    wrapped(x, (mx) => {
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.moveTo(mx - half, LAYER_HEIGHT);
      ctx.lineTo(mx, LAYER_HEIGHT - peak);
      ctx.lineTo(mx + half, LAYER_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Shaded face, then the snow cap sitting on top of both.
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(mx, LAYER_HEIGHT - peak);
      ctx.lineTo(mx + half, LAYER_HEIGHT);
      ctx.lineTo(mx + half * 0.25, LAYER_HEIGHT);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = snow;
      ctx.beginPath();
      ctx.moveTo(mx, LAYER_HEIGHT - peak);
      ctx.lineTo(mx + half * 0.3, LAYER_HEIGHT - peak * 0.68);
      ctx.lineTo(mx + half * 0.12, LAYER_HEIGHT - peak * 0.6);
      ctx.lineTo(mx - half * 0.14, LAYER_HEIGHT - peak * 0.72);
      ctx.lineTo(mx - half * 0.3, LAYER_HEIGHT - peak * 0.64);
      ctx.closePath();
      ctx.fill();
    });
  }
}

/** Conifers with snow-laden branches. */
function paintPines(
  ctx: CanvasRenderingContext2D,
  needle: string,
  snow: string,
  spacing: number,
  seed: number,
): void {
  const rand = seeded(seed);
  for (let x = 0; x < LAYER_WIDTH; x += spacing) {
    const jitter = (rand() - 0.5) * spacing * 0.6;
    const size = 0.8 + rand() * 0.6;
    const base = LAYER_HEIGHT - 2;
    wrapped(x + jitter, (tx) => {
      ctx.fillStyle = '#4a3a2e';
      ctx.fillRect(tx - 1.5 * size, base - 8 * size, 3 * size, 8 * size);
      for (let tier = 0; tier < 3; tier++) {
        const ty = base - (10 + tier * 11) * size;
        const half = (14 - tier * 3) * size;
        ctx.fillStyle = needle;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 13 * size);
        ctx.lineTo(tx + half, ty);
        ctx.lineTo(tx - half, ty);
        ctx.closePath();
        ctx.fill();
        // Snow sits on the upper surface of each tier.
        ctx.fillStyle = snow;
        ctx.beginPath();
        ctx.moveTo(tx, ty - 13 * size);
        ctx.lineTo(tx + half * 0.55, ty - 5 * size);
        ctx.lineTo(tx - half * 0.55, ty - 5 * size);
        ctx.closePath();
        ctx.fill();
      }
    });
  }
}

/** Flat sea with a band of sun glitter running across it. */
function paintSea(
  ctx: CanvasRenderingContext2D,
  water: string,
  haze: string,
  glint: string,
  depth: number,
  seed: number,
): void {
  const rand = seeded(seed);

  // Haze the water out towards the horizon. A flat slab of saturated blue
  // butting straight onto the sky reads as a rectangle, not as distance.
  const gradient = ctx.createLinearGradient(0, LAYER_HEIGHT - depth, 0, LAYER_HEIGHT);
  gradient.addColorStop(0, haze);
  gradient.addColorStop(0.35, water);
  gradient.addColorStop(1, water);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, LAYER_HEIGHT - depth, LAYER_WIDTH, depth);

  ctx.fillStyle = glint;
  for (let i = 0; i < 90; i++) {
    const x = rand() * LAYER_WIDTH;
    const y = LAYER_HEIGHT - depth + rand() * depth;
    // Glitter clusters towards the middle, where the sun's reflection falls.
    const nearMiddle = 1 - Math.abs(x - LAYER_WIDTH / 2) / (LAYER_WIDTH / 2);
    if (rand() > nearMiddle * 0.9 + 0.1) continue;
    ctx.fillRect(x, y, 2 + rand() * 5, 1);
  }
}

/** Rolling breakers, drawn as stacked crescents. */
function paintWaves(ctx: CanvasRenderingContext2D, water: string, foam: string, seed: number): void {
  const rand = seeded(seed);
  for (let row = 0; row < 3; row++) {
    const y = LAYER_HEIGHT - 8 - row * 12;
    ctx.fillStyle = water;
    ctx.fillRect(0, y, LAYER_WIDTH, 12);
    ctx.fillStyle = foam;
    for (let x = -20; x < LAYER_WIDTH + 20; x += 34 + rand() * 18) {
      wrapped(x, (wx) => {
        ctx.beginPath();
        ctx.ellipse(wx, y + 2, 13, 3, 0, Math.PI, 0);
        ctx.fill();
      });
    }
  }
}

/** Palms and dune grass. */
function paintPalms(
  ctx: CanvasRenderingContext2D,
  trunk: string,
  frond: string,
  frondDark: string,
  sand: string,
  seed: number,
): void {
  const rand = seeded(seed);
  const base = LAYER_HEIGHT - 2;

  ctx.fillStyle = sand;
  for (let x = -40; x < LAYER_WIDTH + 40; x += 70) {
    ctx.beginPath();
    ctx.ellipse(x + rand() * 30, LAYER_HEIGHT + 4, 60, 16 + rand() * 10, 0, Math.PI, 0);
    ctx.fill();
  }

  for (let x = 20; x < LAYER_WIDTH; x += 96) {
    const jitter = (rand() - 0.5) * 40;
    const size = 0.85 + rand() * 0.4;
    const lean = (rand() - 0.5) * 8;
    wrapped(x + jitter, (px) => {
      ctx.fillStyle = trunk;
      ctx.beginPath();
      ctx.moveTo(px - 3 * size, base);
      ctx.lineTo(px + lean - 2 * size, base - 46 * size);
      ctx.lineTo(px + lean + 2 * size, base - 46 * size);
      ctx.lineTo(px + 3 * size, base);
      ctx.closePath();
      ctx.fill();

      const crownX = px + lean;
      const crownY = base - 47 * size;
      for (let f = -3; f <= 3; f++) {
        ctx.fillStyle = f % 2 === 0 ? frond : frondDark;
        ctx.beginPath();
        ctx.ellipse(
          crownX + f * 7 * size,
          crownY + Math.abs(f) * 2.4 * size,
          13 * size,
          4 * size,
          f * 0.32,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.fillStyle = frondDark;
      circle(ctx, crownX, crownY, 3 * size);
    });
  }
}

/** Wind-blown drifts banked along the bottom. */
function paintDrifts(ctx: CanvasRenderingContext2D, snow: string, shade: string, seed: number): void {
  const rand = seeded(seed);
  for (let x = -30; x < LAYER_WIDTH + 30; x += 54) {
    const w = 40 + rand() * 34;
    const h = 12 + rand() * 14;
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(x, LAYER_HEIGHT + 3, w, h, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = snow;
    ctx.beginPath();
    ctx.ellipse(x - 3, LAYER_HEIGHT + 5, w * 0.9, h * 0.85, 0, Math.PI, 0);
    ctx.fill();
  }
}

function layer(
  paint: (ctx: CanvasRenderingContext2D) => void,
  factor: number,
  offsetY: number,
  alpha = 1,
): BackdropLayer {
  const { canvas, ctx } = layerCanvas();
  paint(ctx);
  return { canvas, factor, offsetY, alpha };
}

/** Build every parallax layer for a world. */
export function buildBackdrop(theme: Theme): Backdrop {
  switch (theme.id) {
    case 1:
      return {
        sun: { x: 384, y: 46, radius: 20, colour: '#fff3c4', glow: 'rgba(255,240,180,0.30)' },
        flecks: { colour: 'rgba(255,255,255,0.5)', count: 14, drift: 0.16 },
        layers: [
          layer((ctx) => paintClouds(ctx, '#ffffff', 7, 101), 0.05, -78, 0.9),
          layer((ctx) => {
            paintHills(ctx, '#9fdc93', 34, 92, 202);
            paintTrees(ctx, '#7fb47a', '#7ecb78', '#9adf8a', 46, 0.55, 203);
          }, 0.16, -30, 0.75),
          layer((ctx) => {
            paintHills(ctx, '#68b95f', 26, 76, 304);
            paintTrees(ctx, '#5a7f4a', '#57a84f', '#77c46b', 62, 0.8, 305);
          }, 0.33, -12, 0.92),
          layer((ctx) => {
            paintTrees(ctx, '#4a3a2a', '#3f8f42', '#5cb455', 84, 1.15, 406);
            paintUndergrowth(ctx, '#357a38', '#ffe97a', 407);
          }, 0.6, 8, 1),
        ],
      };

    case 2:
      return {
        sun: { x: 300, y: 40, radius: 16, colour: '#eaf4ff', glow: 'rgba(220,238,255,0.28)' },
        flecks: { colour: 'rgba(255,255,255,0.85)', count: 60, drift: 0.5 },
        layers: [
          layer((ctx) => paintClouds(ctx, '#dbe9f7', 8, 111, 1.4), 0.05, -84, 0.75),
          layer(
            (ctx) => paintMountains(ctx, '#a9c2d8', '#8fa9c1', '#f2fbff', 96, 116, 212),
            0.14,
            -34,
            0.8,
          ),
          layer(
            (ctx) => paintMountains(ctx, '#8098b2', '#6b839c', '#e8f4ff', 74, 84, 313),
            0.31,
            -12,
            0.95,
          ),
          layer((ctx) => {
            paintPines(ctx, '#2f5d4a', '#eef8ff', 66, 414);
            paintDrifts(ctx, '#f4fbff', '#cfe2f2', 415);
          }, 0.6, 8, 1),
        ],
      };

    default:
      return {
        // A big low sun: the whole world is named after it.
        sun: { x: 300, y: 122, radius: 40, colour: '#ffe6a8', glow: 'rgba(255,150,90,0.34)' },
        flecks: null,
        layers: [
          layer((ctx) => paintClouds(ctx, 'rgba(255,196,150,0.9)', 9, 121, 2.2), 0.05, -86, 0.9),
          layer((ctx) => paintSea(ctx, '#3f86b8', '#f0a878', '#ffd9a0', 54, 222), 0.12, -26, 0.92),
          layer((ctx) => paintWaves(ctx, '#2f9fd0', '#bdf0ff', 323), 0.3, -6, 0.95),
          layer(
            (ctx) => paintPalms(ctx, '#7a4f2c', '#3f9e5c', '#2d7a45', '#f0cf94', 424),
            0.6,
            10,
            1,
          ),
        ],
      };
  }
}

export { LAYER_HEIGHT, LAYER_WIDTH };
export const HORIZON = VIRTUAL_HEIGHT - LAYER_HEIGHT;
