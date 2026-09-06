/**
 * Roxy, drawn rather than photographed.
 *
 * She is a lean female golden retriever, and every line here is trying to say
 * that rather than just "dog": a narrow head with a long refined muzzle instead
 * of a blocky one, ears set low and feathered rather than short and neat, a
 * ruff down the chest, a plumed tail carried level with the back, and a waist
 * that tucks. A retriever drawn without the feathering is a Labrador, which is
 * the mistake this file exists to stop anyone making twice.
 *
 * Every shape is a path in a unit box - one call draws her at any size, on the
 * playfield under the ball, on the apron, or three hundred pixels tall on the
 * attract screen - so there is exactly one Roxy and she cannot drift between
 * the places she appears.
 *
 * Coordinates run -0.5..0.5 in both directions with (0, 0) at the middle of her
 * face, so `size` is the width of her head.
 */

export const FUR = {
  /** The deeper gold of the ears and the shaded side of her back. */
  dark: '#b8791f',
  mid: '#dda340',
  light: '#f0c471',
  /** Feathering: the ruff, the ear fringes and the tail plume. */
  cream: '#f6ddab',
  pale: '#fbeed2',
  nose: '#2b1b10',
  eye: '#241708',
  tongue: '#e8687a',
  collar: '#e8749c',
  collarDark: '#c04f76',
  tag: '#ffd88a',
} as const;

export interface RoxyMood {
  /** 0 is level, 1 is a full happy squint. */
  readonly squint?: number;
  /** How far the tongue hangs out, 0..1. */
  readonly tongue?: number;
  /** Head tilt in radians, the way a dog tilts at a noise. */
  readonly tilt?: number;
  /** Draw her dimmer, for use as playfield art under the ball. */
  readonly ghost?: number;
}

/**
 * Continue the current path from (ax, ay) to (bx, by) as a row of soft
 * scallops bulging `depth` to one side.
 *
 * This is how all the feathering is drawn: as a wavy edge of the shape itself
 * rather than as separate wisps hung off it. Loose wisps look like hair at
 * three hundred pixels and like spikes at thirty, and thirty is the size she is
 * drawn at most often.
 */
function scallop(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  depth: number,
  lobes: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  // Perpendicular to the run, so the scallops bulge away from the shape.
  const nx = -dy / length;
  const ny = dx / length;

  for (let i = 0; i < lobes; i++) {
    const t0 = i / lobes;
    const t1 = (i + 1) / lobes;
    const mid = (t0 + t1) / 2;
    // The middle lobes hang lowest, the way hair falls longest off the belly of
    // a curve rather than off its ends.
    const reach = depth * (0.55 + 0.45 * Math.sin(mid * Math.PI));
    ctx.quadraticCurveTo(
      ax + dx * mid + nx * reach * 2,
      ay + dy * mid + ny * reach * 2,
      ax + dx * t1,
      ay + dy * t1,
    );
  }
}

/** Both ears, drawn before the head so they sit behind it. */
function ears(ctx: CanvasRenderingContext2D): void {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);

    // A retriever's ear is set level with the eye and hangs well past the jaw,
    // narrow at the base and widening as it falls.
    ctx.fillStyle = FUR.dark;
    ctx.beginPath();
    ctx.moveTo(0.17, -0.22);
    ctx.bezierCurveTo(0.38, -0.26, 0.46, -0.04, 0.43, 0.14);
    ctx.bezierCurveTo(0.42, 0.24, 0.4, 0.3, 0.37, 0.35);
    // The feathered tip, which is the whole difference between this ear and a
    // Labrador's short neat one.
    scallop(ctx, 0.37, 0.35, 0.2, 0.29, -0.028, 3);
    ctx.bezierCurveTo(0.19, 0.14, 0.17, -0.02, 0.17, -0.22);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function head(ctx: CanvasRenderingContext2D): void {
  // Narrow skull, soft stop, long muzzle: a bitch's head rather than a dog's,
  // which is finer through the cheek and shorter across the top.
  ctx.fillStyle = FUR.mid;
  ctx.beginPath();
  ctx.moveTo(-0.29, -0.1);
  ctx.bezierCurveTo(-0.29, -0.39, 0.29, -0.39, 0.29, -0.1);
  ctx.bezierCurveTo(0.29, 0.07, 0.25, 0.2, 0.17, 0.31);
  ctx.bezierCurveTo(0.09, 0.4, -0.09, 0.4, -0.17, 0.31);
  ctx.bezierCurveTo(-0.25, 0.2, -0.29, 0.07, -0.29, -0.1);
  ctx.closePath();
  ctx.fill();

  // The pale blaze up the middle of the face, which is what stops her reading
  // as a flat gold blob at small sizes.
  ctx.fillStyle = FUR.light;
  ctx.beginPath();
  ctx.ellipse(0, 0.02, 0.155, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function muzzle(ctx: CanvasRenderingContext2D, tongue: number): void {
  ctx.fillStyle = FUR.pale;
  ctx.beginPath();
  ctx.ellipse(0, 0.21, 0.15, 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  if (tongue > 0) {
    ctx.fillStyle = FUR.tongue;
    ctx.beginPath();
    ctx.moveTo(-0.048, 0.26);
    ctx.lineTo(0.048, 0.26);
    ctx.bezierCurveTo(0.062, 0.3 + tongue * 0.11, 0.026, 0.34 + tongue * 0.15, 0, 0.34 + tongue * 0.15);
    ctx.bezierCurveTo(-0.026, 0.34 + tongue * 0.15, -0.062, 0.3 + tongue * 0.11, -0.048, 0.26);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = FUR.nose;
  ctx.beginPath();
  ctx.moveTo(-0.058, 0.135);
  ctx.bezierCurveTo(-0.062, 0.098, 0.062, 0.098, 0.058, 0.135);
  ctx.bezierCurveTo(0.046, 0.175, -0.046, 0.175, -0.058, 0.135);
  ctx.closePath();
  ctx.fill();

  // Mouth: two short strokes from under the nose. Anything longer reads as a
  // grimace rather than a dog waiting for you to throw something.
  ctx.strokeStyle = FUR.nose;
  ctx.lineWidth = 0.016;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0.172);
  ctx.lineTo(0, 0.215);
  ctx.moveTo(0, 0.215);
  ctx.bezierCurveTo(-0.028, 0.248, -0.07, 0.24, -0.088, 0.212);
  ctx.moveTo(0, 0.215);
  ctx.bezierCurveTo(0.028, 0.248, 0.07, 0.24, 0.088, 0.212);
  ctx.stroke();
}

function eyes(ctx: CanvasRenderingContext2D, squint: number): void {
  for (const side of [-1, 1]) {
    const x = side * 0.135;
    ctx.fillStyle = FUR.eye;
    if (squint > 0.5) {
      // A happy squint is an upward arc, not a smaller circle.
      ctx.strokeStyle = FUR.eye;
      ctx.lineWidth = 0.03;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 0.05, -0.015);
      ctx.quadraticCurveTo(x, -0.088, x + 0.05, -0.015);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(x, -0.045, 0.043, 0.05 - squint * 0.028, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + 0.016, -0.062, 0.015, 0.015, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function collar(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = FUR.collar;
  ctx.beginPath();
  ctx.moveTo(-0.25, 0.34);
  ctx.bezierCurveTo(-0.1, 0.45, 0.1, 0.45, 0.25, 0.34);
  ctx.lineTo(0.25, 0.43);
  ctx.bezierCurveTo(0.1, 0.54, -0.1, 0.54, -0.25, 0.43);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = FUR.tag;
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 0.043, 0.043, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Roxy's head and collar, centred on (x, y). `size` is the width of her head in
 * whatever units the current transform is in.
 */
export function drawRoxy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  mood: RoxyMood = {},
): void {
  const { squint = 0, tongue = 0.6, tilt = 0, ghost = 0 } = mood;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(size, size);
  if (ghost > 0) ctx.globalAlpha *= 1 - ghost;

  collar(ctx);
  ears(ctx);
  head(ctx);
  muzzle(ctx, tongue);
  eyes(ctx, squint);

  ctx.restore();
}

/**
 * Roxy sitting, for the attract screen and the playfield art. `size` is her
 * head width again, so she scales with `drawRoxy`.
 */
export function drawRoxySitting(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  mood: RoxyMood = {},
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  if (mood.ghost) ctx.globalAlpha *= 1 - mood.ghost;

  // The tail first, so the plume sweeps out from behind her. A retriever's is
  // carried level with the back and feathered along its underside - not the
  // thick smooth curve a Labrador drags around.
  ctx.fillStyle = FUR.light;
  ctx.beginPath();
  ctx.moveTo(0.3, 1.14);
  ctx.bezierCurveTo(0.64, 1.16, 0.92, 1.0, 1.0, 0.72);
  scallop(ctx, 1.0, 0.72, 0.34, 1.2, -0.05, 5);
  ctx.closePath();
  ctx.fill();

  // A darker spine along the top of it, so the plume reads as hair hanging off
  // a tail rather than as a fin.
  ctx.strokeStyle = FUR.dark;
  ctx.lineWidth = 0.055;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0.3, 1.14);
  ctx.bezierCurveTo(0.64, 1.16, 0.92, 1.0, 1.0, 0.72);
  ctx.stroke();

  // The body: lean. Narrow through the chest, tucked at the waist, and only
  // wide at the haunches where a sitting dog actually is wide.
  ctx.fillStyle = FUR.mid;
  ctx.beginPath();
  ctx.moveTo(-0.28, 0.48);
  ctx.bezierCurveTo(-0.4, 0.72, -0.5, 1.02, -0.4, 1.24);
  ctx.lineTo(0.46, 1.24);
  ctx.bezierCurveTo(0.58, 1.0, 0.46, 0.7, 0.28, 0.48);
  ctx.closePath();
  ctx.fill();

  // The ruff: the long pale hair down a retriever's front, with the waist tuck
  // above it. It is the silhouette that names the breed at a glance.
  ctx.fillStyle = FUR.cream;
  ctx.beginPath();
  ctx.moveTo(-0.15, 0.5);
  ctx.bezierCurveTo(-0.26, 0.76, -0.25, 1.0, -0.21, 1.12);
  scallop(ctx, -0.21, 1.12, 0.19, 1.12, 0.05, 4);
  ctx.bezierCurveTo(0.22, 0.94, 0.18, 0.7, 0.13, 0.5);
  ctx.closePath();
  ctx.fill();

  // Front legs: fine-boned and set close, with feathering behind them.
  ctx.fillStyle = FUR.light;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.17, 1.23, 0.12, 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  drawRoxy(ctx, x, y, size, mood);
}

/** A paw print, for the playfield's inserts and the lane arrows. */
export function drawPaw(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(size, size);
  ctx.beginPath();
  ctx.ellipse(0, 0.14, 0.3, 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  const toes: readonly [number, number][] = [
    [-0.28, -0.2],
    [-0.1, -0.32],
    [0.1, -0.32],
    [0.28, -0.2],
  ];
  for (const [tx, ty] of toes) {
    ctx.beginPath();
    ctx.ellipse(tx, ty, 0.1, 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A bone, used for the bonus counter and scattered across the playfield art. */
export function drawBone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(size, size);
  ctx.beginPath();
  ctx.roundRect(-0.36, -0.09, 0.72, 0.18, 0.09);
  ctx.fill();
  for (const side of [-1, 1]) {
    for (const up of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 0.36, up * 0.12, 0.14, 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
