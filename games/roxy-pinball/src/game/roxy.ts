/**
 * Roxy, drawn rather than photographed.
 *
 * She is a yellow Labrador: a blockier head than a retriever's, short
 * triangular ears that lie flat, a broad muzzle and a thick otter tail. Every
 * shape here is a path in a unit box - one call draws her at any size, on the
 * playfield behind the ball, on the apron, or three hundred pixels tall on the
 * attract screen - so there is exactly one Roxy and she cannot drift between
 * the places she appears.
 *
 * Coordinates run -0.5..0.5 in both directions with (0, 0) at the middle of her
 * face, so `size` is the width of her head.
 */

export const FUR = {
  dark: '#a86c28',
  mid: '#d99a45',
  light: '#f2c268',
  cream: '#f7dfae',
  outline: '#42260f',
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
  /** Draw her flatter and dimmer, for use as playfield art under the ball. */
  readonly ghost?: number;
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rotation = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
}

/** Both ears, drawn before the head so they sit behind it. */
function ears(ctx: CanvasRenderingContext2D): void {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.fillStyle = FUR.dark;
    ctx.beginPath();
    // A Labrador ear is a soft triangle: wide where it joins the skull, folding
    // to a rounded point about level with the jaw.
    ctx.moveTo(0.2, -0.26);
    ctx.bezierCurveTo(0.44, -0.3, 0.52, -0.08, 0.46, 0.14);
    ctx.bezierCurveTo(0.43, 0.26, 0.33, 0.3, 0.27, 0.22);
    ctx.bezierCurveTo(0.22, 0.1, 0.2, -0.08, 0.2, -0.26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function head(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = FUR.mid;
  ctx.beginPath();
  ctx.moveTo(-0.34, -0.12);
  ctx.bezierCurveTo(-0.34, -0.42, 0.34, -0.42, 0.34, -0.12);
  ctx.bezierCurveTo(0.34, 0.06, 0.3, 0.2, 0.2, 0.3);
  ctx.bezierCurveTo(0.1, 0.39, -0.1, 0.39, -0.2, 0.3);
  ctx.bezierCurveTo(-0.3, 0.2, -0.34, 0.06, -0.34, -0.12);
  ctx.closePath();
  ctx.fill();

  // The lighter blaze up the middle of the face, which is what stops a yellow
  // Labrador reading as a flat brown blob at small sizes.
  ctx.fillStyle = FUR.light;
  ellipse(ctx, 0, 0.02, 0.19, 0.3);
  ctx.fill();
}

function muzzle(ctx: CanvasRenderingContext2D, tongue: number): void {
  ctx.fillStyle = FUR.cream;
  ellipse(ctx, 0, 0.19, 0.19, 0.145);
  ctx.fill();

  if (tongue > 0) {
    ctx.fillStyle = FUR.tongue;
    ctx.beginPath();
    ctx.moveTo(-0.055, 0.24);
    ctx.lineTo(0.055, 0.24);
    ctx.bezierCurveTo(0.07, 0.28 + tongue * 0.12, 0.03, 0.32 + tongue * 0.16, 0, 0.32 + tongue * 0.16);
    ctx.bezierCurveTo(-0.03, 0.32 + tongue * 0.16, -0.07, 0.28 + tongue * 0.12, -0.055, 0.24);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = FUR.nose;
  ctx.beginPath();
  ctx.moveTo(-0.07, 0.115);
  ctx.bezierCurveTo(-0.075, 0.075, 0.075, 0.075, 0.07, 0.115);
  ctx.bezierCurveTo(0.055, 0.16, -0.055, 0.16, -0.07, 0.115);
  ctx.closePath();
  ctx.fill();

  // Mouth: two short strokes from under the nose. Anything longer reads as a
  // grimace rather than a dog waiting for you to throw something.
  ctx.strokeStyle = FUR.nose;
  ctx.lineWidth = 0.018;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0.155);
  ctx.lineTo(0, 0.2);
  ctx.moveTo(0, 0.2);
  ctx.bezierCurveTo(-0.03, 0.235, -0.08, 0.225, -0.1, 0.195);
  ctx.moveTo(0, 0.2);
  ctx.bezierCurveTo(0.03, 0.235, 0.08, 0.225, 0.1, 0.195);
  ctx.stroke();
}

function eyes(ctx: CanvasRenderingContext2D, squint: number): void {
  for (const side of [-1, 1]) {
    const x = side * 0.145;
    ctx.fillStyle = FUR.eye;
    if (squint > 0.5) {
      // A happy squint is an upward arc, not a smaller circle.
      ctx.strokeStyle = FUR.eye;
      ctx.lineWidth = 0.032;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 0.055, -0.02);
      ctx.quadraticCurveTo(x, -0.095, x + 0.055, -0.02);
      ctx.stroke();
      continue;
    }
    ellipse(ctx, x, -0.05, 0.048, 0.055 - squint * 0.03);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, x + 0.018, -0.068, 0.016, 0.016);
    ctx.fill();
  }
}

function collar(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = FUR.collar;
  ctx.beginPath();
  ctx.moveTo(-0.26, 0.33);
  ctx.bezierCurveTo(-0.1, 0.44, 0.1, 0.44, 0.26, 0.33);
  ctx.lineTo(0.26, 0.42);
  ctx.bezierCurveTo(0.1, 0.53, -0.1, 0.53, -0.26, 0.42);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = FUR.tag;
  ellipse(ctx, 0, 0.49, 0.045, 0.045);
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
 * Roxy sitting, for the attract screen and the middle of the playfield. `size`
 * is her head width again, so she scales with `drawRoxy`.
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

  // Tail first, so it sweeps out from behind her.
  ctx.fillStyle = FUR.dark;
  ctx.beginPath();
  ctx.moveTo(0.42, 1.24);
  ctx.bezierCurveTo(0.78, 1.22, 0.98, 0.98, 0.92, 0.7);
  ctx.bezierCurveTo(0.88, 0.86, 0.72, 1.04, 0.44, 1.08);
  ctx.closePath();
  ctx.fill();

  // The body: a wedge, wide at the haunches, narrowing to the chest.
  ctx.fillStyle = FUR.mid;
  ctx.beginPath();
  ctx.moveTo(-0.34, 0.5);
  ctx.bezierCurveTo(-0.52, 0.78, -0.58, 1.1, -0.44, 1.26);
  ctx.lineTo(0.5, 1.26);
  ctx.bezierCurveTo(0.66, 1.04, 0.56, 0.7, 0.34, 0.5);
  ctx.closePath();
  ctx.fill();

  // Chest, in the pale fur that a yellow Labrador wears down the front.
  ctx.fillStyle = FUR.cream;
  ctx.beginPath();
  ctx.moveTo(-0.16, 0.52);
  ctx.bezierCurveTo(-0.3, 0.84, -0.28, 1.1, -0.2, 1.26);
  ctx.lineTo(0.18, 1.26);
  ctx.bezierCurveTo(0.24, 1.02, 0.2, 0.74, 0.14, 0.52);
  ctx.closePath();
  ctx.fill();

  // Front paws.
  ctx.fillStyle = FUR.light;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.2, 1.24, 0.15, 0.09, 0, 0, Math.PI * 2);
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
