/**
 * The screens either side of a game: attract, paused, and the score at the end.
 *
 * They are drawn on the same canvas as everything else in CSS pixels, and their
 * buttons are described once and used for both drawing and hit-testing, so a
 * button can never move without its target moving with it.
 */
import type { Layout } from '../engine/renderer';
import type { SaveData } from '../engine/storage';
import type { Session } from './session';
import { PALETTE, dim } from './theme';
import { MISSIONS } from './missions';
import { formatScore } from './scoring';
import { drawBone, drawPaw, drawRoxySitting } from './roxy';

export interface ScreenButton {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly primary: boolean;
}

function stack(layout: Layout, labels: readonly (readonly [string, string, boolean])[]): ScreenButton[] {
  const width = Math.min(layout.width - 64, 300);
  const height = 54;
  const gap = 12;
  const x = (layout.width - width) / 2;
  const total = labels.length * height + (labels.length - 1) * gap;
  const top = layout.height - layout.barHeight - total - 26;
  return labels.map(([id, label, primary], index) => ({
    id,
    label,
    x,
    y: top + index * (height + gap),
    width,
    height,
    primary,
  }));
}

export function attractButtons(layout: Layout): readonly ScreenButton[] {
  return stack(layout, [['play', 'PLAY', true]]);
}

export function pauseButtons(layout: Layout): readonly ScreenButton[] {
  return stack(layout, [
    ['resume', 'RESUME', true],
    ['quit', 'END GAME', false],
  ]);
}

export function gameOverButtons(layout: Layout): readonly ScreenButton[] {
  return stack(layout, [['play', 'PLAY AGAIN', true]]);
}

export function hitButton(
  buttons: readonly ScreenButton[],
  point: { x: number; y: number },
): string | null {
  for (const button of buttons) {
    if (
      point.x >= button.x &&
      point.x <= button.x + button.width &&
      point.y >= button.y &&
      point.y <= button.y + button.height
    ) {
      return button.id;
    }
  }
  return null;
}

function scrim(ctx: CanvasRenderingContext2D, layout: Layout, alpha: number): void {
  ctx.fillStyle = `rgba(7, 4, 15, ${alpha})`;
  ctx.fillRect(0, 0, layout.width, layout.height);
}

function drawButtons(ctx: CanvasRenderingContext2D, buttons: readonly ScreenButton[]): void {
  for (const button of buttons) {
    ctx.fillStyle = button.primary ? PALETTE.gold : dim(PALETTE.deck, 1.4);
    ctx.beginPath();
    ctx.roundRect(button.x, button.y, button.width, button.height, 16);
    ctx.fill();
    if (!button.primary) {
      ctx.strokeStyle = PALETTE.rail;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = button.primary ? PALETTE.space : PALETTE.ink;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.label, button.x + button.width / 2, button.y + button.height / 2 + 1);
  }
}

function title(ctx: CanvasRenderingContext2D, layout: Layout, y: number): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold ${Math.round(Math.min(52, layout.width * 0.13))}px system-ui, sans-serif`;
  ctx.fillText('ROXY', layout.width / 2, y);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `${Math.round(Math.min(30, layout.width * 0.075))}px system-ui, sans-serif`;
  ctx.letterSpacing = '6px';
  ctx.fillText('PINBALL', layout.width / 2, y + Math.min(44, layout.width * 0.108));
  ctx.letterSpacing = '0px';
}

export function drawAttract(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  save: SaveData,
  tick: number,
): void {
  scrim(ctx, layout, 0.78);
  const centre = layout.width / 2;
  const buttons = attractButtons(layout);
  const bottom = buttons[0]?.y ?? layout.height;

  // Laid out from the top down and the buttons up, so a short phone squeezes
  // Roxy rather than letting the high score table land on top of her.
  const titleY = layout.hudHeight + 56;
  const lines = save.highScores.length > 0 ? save.highScores.slice(0, 4).length + 1 : 2;
  const listHeight = lines * 20;
  const roxyTop = titleY + 62;
  const roxyBottom = bottom - listHeight - 44;
  const size = Math.max(
    36,
    Math.min(96, layout.width * 0.24, (roxyBottom - roxyTop) / 1.9),
  );

  ctx.save();
  ctx.fillStyle = dim(PALETTE.gold, 0.3);
  for (let i = 0; i < 6; i++) {
    const t = (tick / 90 + i / 6) % 1;
    drawPaw(ctx, centre - 130 + i * 52, titleY - 48 + Math.sin(t * Math.PI * 2) * 5, 16, 0);
  }
  ctx.restore();

  title(ctx, layout, titleY);

  const roxyY = roxyTop + size * 0.6;
  drawRoxySitting(ctx, centre, roxyY, size, {
    squint: 0.9,
    tongue: 0.75,
    tilt: Math.sin(tick / 40) * 0.06,
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Six missions, three balls, one Labrador.', centre, roxyY + size * 1.5);

  const listTop = bottom - listHeight - 16;
  if (save.highScores.length > 0) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('BEST IN SHOW', centre, listTop);
    ctx.font = '14px system-ui, sans-serif';
    save.highScores.slice(0, 4).forEach((entry, index) => {
      ctx.fillStyle = index === 0 ? PALETTE.ink : PALETTE.muted;
      ctx.fillText(
        `${index + 1}.  ${formatScore(entry.score)}   ${entry.missions}/${MISSIONS.length}`,
        centre,
        listTop + 20 + index * 20,
      );
    });
  } else {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Flippers: tap either side of the screen,', centre, listTop);
    ctx.fillText('or the arrow keys. Pull the plunger to start.', centre, listTop + 20);
  }

  drawButtons(ctx, buttons);
}

export function drawPaused(ctx: CanvasRenderingContext2D, layout: Layout): void {
  scrim(ctx, layout, 0.82);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText('PAUSED', layout.width / 2, layout.height * 0.32);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Roxy will wait. She is good at that.', layout.width / 2, layout.height * 0.32 + 30);
  drawButtons(ctx, pauseButtons(layout));
}

export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  session: Session,
  rank: number,
  tick: number,
): void {
  scrim(ctx, layout, 0.88);
  const centre = layout.width / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('GAME OVER', centre, layout.hudHeight + 46);

  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold ${Math.round(Math.min(46, layout.width * 0.11))}px system-ui, sans-serif`;
  ctx.fillText(formatScore(session.score.score), centre, layout.hudHeight + 96);

  ctx.fillStyle = PALETTE.muted;
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(
    `${session.missions.completed.length} of ${MISSIONS.length} missions`,
    centre,
    layout.hudHeight + 128,
  );

  if (rank >= 0) {
    ctx.fillStyle = PALETTE.pink;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`NEW HIGH SCORE - NUMBER ${rank + 1}`, centre, layout.hudHeight + 156);
  }

  drawRoxySitting(ctx, centre, layout.height * 0.5, Math.min(84, layout.width * 0.21), {
    squint: rank >= 0 ? 0.9 : 0.2,
    tongue: rank >= 0 ? 0.9 : 0.35,
    tilt: Math.sin(tick / 44) * 0.05,
  });

  ctx.save();
  ctx.fillStyle = dim(PALETTE.gold, 0.5);
  drawBone(ctx, centre, layout.height * 0.5 + 132, 40, Math.sin(tick / 50) * 0.2);
  ctx.restore();

  drawButtons(ctx, gameOverButtons(layout));
}
