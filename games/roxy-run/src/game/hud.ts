/**
 * The HUD and the touch controls, drawn in CSS pixels straight onto the visible
 * canvas rather than into the 480x270 world buffer. That keeps text legible on
 * a phone and lets the buttons sit in the letterbox bars instead of covering
 * the level.
 */
import type { Input } from '../engine/input';
import type { Layout } from '../engine/renderer';
import { formatScore, formatTime } from './scoring';
import type { Session } from './session';
import type { Sprites } from './sprites';

const PANEL = 'rgba(12, 8, 26, 0.62)';
const INK = '#ffffff';
const ACCENT = '#ffd88a';

/** HUD text scales with the screen so it reads on a phone and on a desktop. */
function baseSize(layout: Layout): number {
  return Math.max(12, Math.min(layout.height * 0.045, 26));
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  session: Session,
  sprites: Sprites,
): void {
  const size = baseSize(layout);
  const pad = size * 0.6;
  const lineHeight = size * 1.25;
  const left = pad + layout.insets.left;
  const top = pad + layout.insets.top;

  ctx.textBaseline = 'top';
  ctx.font = `600 ${size}px system-ui, sans-serif`;

  const lines = [
    `SCORE ${formatScore(session.run.score)}`,
    `BONES ${session.run.bones}`,
    `TIME  ${formatTime(session.remainingMs)}`,
  ];
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + pad * 2;

  ctx.fillStyle = PANEL;
  roundRect(ctx, left, top, width, lineHeight * lines.length + pad, size * 0.4);
  ctx.fill();

  lines.forEach((line, i) => {
    // The clock turns amber under ten seconds - the only warning there is.
    const urgent = i === 2 && session.remainingMs < 10_000;
    ctx.fillStyle = urgent ? ACCENT : INK;
    ctx.fillText(line, left + pad, top + pad * 0.9 + i * lineHeight);
  });

  drawLives(ctx, layout, session, size, pad, sprites);
  if (session.chaseIsClose) drawChaseWarning(ctx, layout, session, size);
}

/** A flashing banner, because the chase arrives from off the left of the screen. */
function drawChaseWarning(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  session: Session,
  size: number,
): void {
  const flash = Math.floor(session.run.elapsedMs / 250) % 2 === 0;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `800 ${size * 1.3}px system-ui, sans-serif`;
  ctx.fillStyle = flash ? '#ff6f61' : ACCENT;
  ctx.fillText(session.theme.chase.name, layout.width / 2, layout.insets.top + size * 0.8);
  ctx.restore();
}

function drawLives(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  session: Session,
  size: number,
  pad: number,
  sprites: Sprites,
): void {
  const text = `x${Math.max(0, session.run.lives)}`;
  ctx.font = `600 ${size}px system-ui, sans-serif`;

  // The counter shows the same bone the player collects, drawn from the sheet
  // rather than approximated with canvas shapes, so the two always match.
  const bone = sprites.propSize('bone');
  const scale = Math.max(1, Math.round((size * 1.1) / bone.h));
  const boneW = bone.w * scale;
  const boneH = bone.h * scale;

  const width = ctx.measureText(text).width + boneW + size * 1.4;
  const right = layout.width - pad - layout.insets.right;
  const top = pad + layout.insets.top;
  const height = Math.max(size * 1.8, boneH + size * 0.5);

  ctx.fillStyle = PANEL;
  roundRect(ctx, right - width, top, width, height, size * 0.4);
  ctx.fill();

  sprites.drawPropScaled(
    ctx,
    'bone',
    right - width + size * 0.5,
    top + (height - boneH) / 2,
    scale,
  );

  ctx.fillStyle = INK;
  ctx.fillText(text, right - width + size * 0.5 + boneW + size * 0.4, top + (height - size) / 2);
}

/** The virtual buttons. Only drawn once the player has actually used touch. */
export function drawTouchControls(ctx: CanvasRenderingContext2D, input: Input): void {
  if (!input.touchActive) return;

  for (const button of input.touchButtons) {
    const pressed = input.isTouching(button.id);
    ctx.beginPath();
    ctx.arc(button.x, button.y, button.radius, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? 'rgba(255, 216, 138, 0.45)' : 'rgba(255, 255, 255, 0.16)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke();

    ctx.fillStyle = pressed ? '#1b1030' : 'rgba(255, 255, 255, 0.85)';
    drawGlyph(ctx, button.id, button.x, button.y, button.radius);
  }
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  radius: number,
): void {
  const r = radius * 0.42;
  ctx.beginPath();
  switch (id) {
    case 'left':
      ctx.moveTo(x + r * 0.6, y - r);
      ctx.lineTo(x + r * 0.6, y + r);
      ctx.lineTo(x - r * 0.8, y);
      break;
    case 'right':
      ctx.moveTo(x - r * 0.6, y - r);
      ctx.lineTo(x - r * 0.6, y + r);
      ctx.lineTo(x + r * 0.8, y);
      break;
    case 'down':
      ctx.moveTo(x - r, y - r * 0.6);
      ctx.lineTo(x + r, y - r * 0.6);
      ctx.lineTo(x, y + r * 0.8);
      break;
    default:
      // Jump: an upward chevron, which reads faster than the word.
      ctx.moveTo(x - r, y + r * 0.5);
      ctx.lineTo(x, y - r * 0.7);
      ctx.lineTo(x + r, y + r * 0.5);
      ctx.lineTo(x, y - r * 0.1);
      break;
  }
  ctx.closePath();
  ctx.fill();
}

export interface OverlayOptions {
  readonly title: string;
  readonly lines?: readonly string[];
  readonly prompt?: string;
  /** Dim the game behind the panel. */
  readonly dim?: boolean;
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  options: OverlayOptions,
  tick: number,
): void {
  if (options.dim !== false) {
    ctx.fillStyle = 'rgba(8, 5, 18, 0.72)';
    ctx.fillRect(0, 0, layout.width, layout.height);
  }

  const size = baseSize(layout);
  const centreX = layout.width / 2;
  let y = layout.height / 2 - size * 2.2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `700 ${size * 1.9}px system-ui, sans-serif`;
  ctx.fillStyle = ACCENT;
  ctx.fillText(options.title, centreX, y);
  y += size * 2.2;

  ctx.font = `500 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = INK;
  for (const line of options.lines ?? []) {
    ctx.fillText(line, centreX, y);
    y += size * 1.5;
  }

  if (options.prompt) {
    // Pulse the prompt so it is obvious the game is waiting for you.
    ctx.globalAlpha = 0.55 + Math.sin(tick / 14) * 0.35;
    ctx.font = `600 ${size * 1.05}px system-ui, sans-serif`;
    ctx.fillStyle = ACCENT;
    ctx.fillText(options.prompt, centreX, y + size * 0.8);
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
