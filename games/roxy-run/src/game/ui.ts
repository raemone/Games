/**
 * Shared tappable-button drawing.
 *
 * Every button is returned as a region so the caller can hit-test it. Drawing
 * and input stay separate, which keeps the render path free of side effects and
 * means a button can never be tappable somewhere it is not drawn.
 */
import type { Layout } from '../engine/renderer';

export interface UiButton {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const ACCENT = '#ffd88a';
const INK = '#f4ecff';

export function uiScale(layout: Layout): number {
  return Math.max(12, Math.min(layout.height * 0.045, 26));
}

export function hitButton(buttons: readonly UiButton[], x: number, y: number): string | null {
  for (const button of buttons) {
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
      return button.id;
    }
  }
  return null;
}

export function roundRect(
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

/**
 * Lay out a row of buttons centred on `centreX`, and draw them.
 * Sized for a child's thumb rather than a mouse pointer.
 */
export function drawButtonRow(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  centreY: number,
  labels: readonly { readonly id: string; readonly text: string }[],
  focused: string | null,
): UiButton[] {
  const size = uiScale(layout);
  ctx.font = `700 ${size}px system-ui, sans-serif`;

  const padding = size * 1.4;
  const height = size * 2.4;
  const gap = size * 0.8;
  const widths = labels.map((l) => Math.max(ctx.measureText(l.text).width + padding * 2, size * 6));
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (labels.length - 1);

  let x = layout.width / 2 - total / 2;
  const buttons: UiButton[] = [];

  labels.forEach((label, index) => {
    const w = widths[index]!;
    const button = { id: label.id, x, y: centreY - height / 2, w, h: height };
    buttons.push(button);

    const isFocused = focused === label.id;
    roundRect(ctx, button.x, button.y, w, height, size * 0.6);
    ctx.fillStyle = isFocused ? ACCENT : '#2a1b4a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isFocused ? ACCENT : '#4a3675';
    ctx.stroke();

    ctx.fillStyle = isFocused ? '#1b1030' : INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.text, button.x + w / 2, centreY);

    x += w + gap;
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  return buttons;
}

/**
 * The pause and mute controls, tucked into the top-right corner.
 * Without these there is no way to pause or silence the game on a tablet.
 */
export function drawCornerControls(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  muted: boolean,
  showPause: boolean,
): UiButton[] {
  const size = uiScale(layout);
  const button = size * 2.1;
  const margin = size * 0.6;
  // Below the lives panel, which occupies the very top-right.
  const y = margin * 2 + size * 1.8 + layout.insets.top;

  const buttons: UiButton[] = [];
  let x = layout.width - margin - button - layout.insets.right;

  if (showPause) {
    buttons.push({ id: 'pause', x, y, w: button, h: button });
    drawIconButton(ctx, x, y, button, 'pause');
    x -= button + margin * 0.6;
  }

  buttons.push({ id: 'mute', x, y, w: button, h: button });
  drawIconButton(ctx, x, y, button, muted ? 'muted' : 'sound');

  return buttons;
}

function drawIconButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  icon: 'pause' | 'sound' | 'muted',
): void {
  roundRect(ctx, x, y, size, size, size * 0.28);
  ctx.fillStyle = 'rgba(12, 8, 26, 0.62)';
  ctx.fill();

  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.24;
  ctx.fillStyle = INK;

  if (icon === 'pause') {
    ctx.fillRect(cx - r * 0.8, cy - r, r * 0.6, r * 2);
    ctx.fillRect(cx + r * 0.2, cy - r, r * 0.6, r * 2);
    return;
  }

  // Speaker cone.
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r * 0.4);
  ctx.lineTo(cx - r * 0.4, cy - r * 0.4);
  ctx.lineTo(cx + r * 0.2, cy - r);
  ctx.lineTo(cx + r * 0.2, cy + r);
  ctx.lineTo(cx - r * 0.4, cy + r * 0.4);
  ctx.lineTo(cx - r, cy + r * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = Math.max(2, r * 0.25);
  ctx.strokeStyle = INK;
  if (icon === 'muted') {
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.5, cy - r * 0.5);
    ctx.lineTo(cx + r * 1.1, cy + r * 0.5);
    ctx.moveTo(cx + r * 1.1, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ctx.arc(cx + r * 0.2, cy, r * 0.85, -0.9, 0.9);
  ctx.stroke();
}
