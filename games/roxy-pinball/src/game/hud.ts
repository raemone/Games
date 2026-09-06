/**
 * The score band above the table and the button strip below it, both drawn in
 * CSS pixels so text stays sharp and the buttons stay thumb-sized whatever the
 * table is scaled to.
 */
import type { Layout } from '../engine/renderer';
import type { Input } from '../engine/input';
import type { Session } from './session';
import { PALETTE, dim } from './theme';
import { MISSIONS, missionById } from './missions';
import { formatScore } from './scoring';
import { drawRoxy } from './roxy';

export interface HudButton {
  readonly id: 'pause' | 'mute';
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** The two icon buttons in the top-right corner, as one shared definition. */
export function hudButtons(layout: Layout): readonly HudButton[] {
  const size = 40;
  const right = layout.contentLeft + layout.contentWidth - size;
  const y = layout.insets.top + 10;
  return [
    { id: 'mute', x: right - size - 8, y, size },
    { id: 'pause', x: right, y, size },
  ];
}

export function hitHudButton(
  layout: Layout,
  point: { x: number; y: number },
): HudButton['id'] | null {
  for (const button of hudButtons(layout)) {
    if (
      point.x >= button.x - 6 &&
      point.x <= button.x + button.size + 6 &&
      point.y >= button.y - 6 &&
      point.y <= button.y + button.size + 6
    ) {
      return button.id;
    }
  }
  return null;
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  session: Session,
  muted: boolean,
): void {
  const left = layout.contentLeft;
  const top = layout.insets.top;

  ctx.save();
  ctx.fillStyle = PALETTE.space;
  ctx.fillRect(0, 0, layout.width, layout.hudHeight);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold ${Math.round(Math.min(38, layout.contentWidth * 0.09))}px system-ui, sans-serif`;
  ctx.fillText(formatScore(session.score.score), left, top + 44);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  const line = [
    `BALL ${session.ballNumber}`,
    `BONUS x${session.score.multiplier}`,
    `${session.score.bones} BONES`,
    `${session.missions.completed.length}/${MISSIONS.length} MISSIONS`,
  ].join('   ');
  ctx.fillText(line, left, top + 62);

  if (session.ballSaveLit || session.skillShotLit || session.inMultiball || session.tilted) {
    const badge = session.tilted
      ? { text: 'TILT', colour: PALETTE.red }
      : session.inMultiball
        ? { text: 'MULTIBALL', colour: PALETTE.gold }
        : session.skillShotLit
          ? { text: 'SKILL SHOT LIT', colour: PALETTE.pink }
          : { text: 'BALL SAVE', colour: PALETTE.green };
    ctx.fillStyle = badge.colour;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(badge.text, left, top + 80);
  }

  for (const button of hudButtons(layout)) {
    ctx.fillStyle = dim(PALETTE.deck, 1.2);
    ctx.beginPath();
    ctx.roundRect(button.x, button.y, button.size, button.size, 11);
    ctx.fill();
    ctx.strokeStyle = PALETTE.rail;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Drawn rather than set as an emoji: the same glyph is a different picture
    // on every platform, and two of them are a blank box on some Androids.
    drawIcon(ctx, button, muted);
  }
  ctx.restore();
}

function drawIcon(ctx: CanvasRenderingContext2D, button: HudButton, muted: boolean): void {
  const cx = button.x + button.size / 2;
  const cy = button.y + button.size / 2;
  ctx.save();
  ctx.fillStyle = PALETTE.ink;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  if (button.id === 'pause') {
    ctx.fillRect(cx - 5, cy - 7, 4, 14);
    ctx.fillRect(cx + 1, cy - 7, 4, 14);
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 3);
    ctx.lineTo(cx - 4, cy - 3);
    ctx.lineTo(cx + 1, cy - 8);
    ctx.lineTo(cx + 1, cy + 8);
    ctx.lineTo(cx - 4, cy + 3);
    ctx.lineTo(cx - 8, cy + 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    if (muted) {
      ctx.moveTo(cx + 5, cy - 4);
      ctx.lineTo(cx + 11, cy + 4);
      ctx.moveTo(cx + 11, cy - 4);
      ctx.lineTo(cx + 5, cy + 4);
    } else {
      ctx.arc(cx + 2, cy, 6, -0.9, 0.9);
      ctx.moveTo(cx + 9, cy - 5);
      ctx.arc(cx + 2, cy, 9, -0.7, 0.7);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** The big centred announcement: a mission starting, a jackpot, a tilt. */
export function drawBanner(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  session: Session,
): void {
  const banner = session.banner;
  if (!banner) return;

  // Fades out over its last half second, so nothing ever snaps off the screen.
  const alpha = Math.min(1, banner.ticks / 30);
  const centreX = layout.width / 2;
  const y = layout.hudHeight + layout.height * 0.1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const width = Math.min(layout.width - 32, 420);
  const height = banner.detail ? 76 : 52;
  ctx.fillStyle = 'rgba(7, 4, 15, 0.86)';
  ctx.beginPath();
  ctx.roundRect(centreX - width / 2, y - height / 2, width, height, 14);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText(banner.text, centreX, y - (banner.detail ? 14 : 0));
  if (banner.detail) {
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(banner.detail, centreX, y + 16);
  }
  ctx.restore();
}

/**
 * The apron: the strip a real table carries its instruction card on. It sits
 * just above the buttons and says the one thing a new player most needs told -
 * what to shoot next - plus how the running mission is going.
 *
 * On a real table this is painted on the metal below the flippers. Here it is
 * drawn on the overlay rather than into the playfield texture, because the text
 * changes every few seconds and a texture that changes is a texture uploaded to
 * the GPU sixty times a second.
 */
export const APRON_HEIGHT = 52;

export function drawApron(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  session: Session,
): void {
  const height = APRON_HEIGHT - 6;
  const y = layout.height - layout.barHeight - height - 6;
  const x = layout.contentLeft;
  const width = layout.contentWidth;

  ctx.save();
  ctx.fillStyle = 'rgba(7, 4, 15, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.strokeStyle = dim(PALETTE.rail, 0.6);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawRoxy(ctx, x + 26, y + height / 2, 30, { squint: 0.9, tongue: 0.7, tilt: -0.12 });

  const active = session.missions.active;
  const hint = active
    ? missionById(active.id).hint
    : session.missions.wizardLit
      ? 'Shoot the doghouse for Best in Show'
      : `Shoot the doghouse to start ${missionById(session.missions.selected).name}`;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(hint, x + 50, y + (active ? 15 : height / 2));

  if (active) {
    const definition = missionById(active.id);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(
      `${definition.name}  ${active.progress}/${active.goal}  ${Math.ceil(active.ticksLeft / 60)}s`,
      x + 50,
      y + 33,
    );
  }
  ctx.restore();
}

/**
 * The button strip. The two flipper halves are not drawn as buttons - they are
 * the whole screen - so this only has to show the plunger and the nudges, and
 * only while a finger has ever touched the glass.
 */
export function drawControls(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  input: Input,
  session: Session,
): void {
  const waiting = session.phase === 'ready';

  ctx.save();
  ctx.fillStyle = PALETTE.space;
  ctx.fillRect(0, layout.height - layout.barHeight, layout.width, layout.barHeight);

  for (const button of input.barButtons) {
    const isPlunge = button.id === 'plunge';
    const active = input.isTouching(button.id);
    const enabled = isPlunge ? waiting : !session.tilted;

    ctx.globalAlpha = enabled ? 1 : 0.35;
    ctx.fillStyle = active ? dim(PALETTE.gold, 0.5) : dim(PALETTE.deck, 1.3);
    ctx.beginPath();
    ctx.roundRect(button.x, button.y, button.width, button.height, 14);
    ctx.fill();
    ctx.strokeStyle = isPlunge && waiting ? PALETTE.gold : PALETTE.rail;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = isPlunge && waiting ? PALETTE.gold : PALETTE.muted;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = isPlunge && !waiting ? 'FLIP: TAP EITHER SIDE' : button.label;
    ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2);

    if (isPlunge && waiting && session.plungerCharge > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(
        button.x + 6,
        button.y + button.height - 10,
        (button.width - 12) * session.plungerCharge,
        4,
      );
    }
  }
  ctx.globalAlpha = 1;

  // Roxy watching from beside the strip, on a screen wide enough to have room
  // spare. On a phone there is none, and she is on the apron anyway.
  const first = input.barButtons[0];
  if (first && layout.contentLeft > 70) {
    drawRoxy(ctx, layout.contentLeft - 36, first.y + first.height / 2, 38, {
      squint: 0.9,
      tongue: 0.5,
    });
  }
  ctx.restore();
}
