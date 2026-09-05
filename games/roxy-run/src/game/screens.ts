/**
 * Title and level-select screens. Both are drawn in CSS pixels and both are
 * fully usable by tap or by keys, because an eight-year-old on a tablet and a
 * parent on a laptop should get the same game.
 */
import type { Layout } from '../engine/renderer';
import { LEVELS, WORLD_COUNT } from '../levels';
import type { OverallBoard } from '../engine/leaderboard';
import type { SaveData } from '../engine/storage';
import { formatScore, formatTime } from './scoring';
import { THEMES } from './theme';
import { roundRect } from './ui';

export interface Hotspot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Index into LEVELS, or -1 for a non-level control. */
  readonly index: number;
}

const INK = '#f4ecff';
const DIM = '#9c8bc0';
const ACCENT = '#ffd88a';

function scaleOf(layout: Layout): number {
  return Math.max(12, Math.min(layout.height * 0.045, 26));
}

/** What the title screen knows about the world board, if anything. */
export interface TitleBoard {
  readonly status: 'off' | 'loading' | 'ready' | 'error';
  readonly board: OverallBoard | null;
}

export function drawTitle(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  tick: number,
  world: TitleBoard = { status: 'off', board: null },
): void {
  const size = scaleOf(layout);
  const cx = layout.width / 2;

  const sky = ctx.createLinearGradient(0, 0, 0, layout.height);
  sky.addColorStop(0, '#2a1b4a');
  sky.addColorStop(1, '#0b0715');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `800 ${size * 3}px system-ui, sans-serif`;
  ctx.fillStyle = ACCENT;
  // A slow bob, so the screen is never completely still.
  ctx.fillText('ROXY RUN', cx, layout.height * 0.34 + Math.sin(tick / 40) * 4);

  ctx.font = `500 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = DIM;
  ctx.fillText('A very good dog, going very fast', cx, layout.height * 0.34 + size * 2.4);

  if (world.status !== 'off') drawTitleBoard(ctx, layout, size, world);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.55 + Math.sin(tick / 14) * 0.35;
  ctx.font = `700 ${size * 1.2}px system-ui, sans-serif`;
  ctx.fillStyle = INK;
  ctx.fillText('TAP TO START', cx, layout.height * 0.84);
  ctx.globalAlpha = 1;

  ctx.font = `400 ${size * 0.8}px system-ui, sans-serif`;
  ctx.fillStyle = DIM;
  ctx.fillText('Arrows to run  ·  Space to jump  ·  Down to roll', cx, layout.height * 0.93);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

/**
 * The overall board, small, under the title.
 *
 * Every level added together rather than one level's table: which level would
 * you put on the front of the game? "Who is winning" is the question anyone
 * glancing at a leaderboard is asking, and it is the one a total answers.
 *
 * Deliberately not tappable. The whole screen means "start", and a child who
 * taps the game's name expecting to play should not land in a menu.
 */
function drawTitleBoard(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  size: number,
  world: TitleBoard,
): void {
  const rowHeight = size * 1.25;
  // Sits between the subtitle and "TAP TO START", both of which move with the
  // screen - so the panel is placed from them rather than from a fraction of
  // the height that only happens to work on a laptop.
  const y = layout.height * 0.34 + size * 3.6;
  const floor = layout.height * 0.84 - size * 1.6;
  // Header plus rows, with the space above the first row and below the last
  // matched - the panel reads as lopsided otherwise.
  const chrome = size * 1.75;

  // A phone held sideways has room for two or three rows, a laptop for five.
  // Showing more than fits would run the board through the words underneath.
  const fits = Math.floor((floor - y - chrome) / rowHeight);
  const rows = world.board?.entries ?? [];
  const shown = rows.slice(0, Math.max(1, Math.min(5, fits)));
  if (fits < 1) return;

  const width = Math.min(layout.width - size * 4, size * 16);
  const height = chrome + Math.max(shown.length, 1) * rowHeight;
  const x = (layout.width - width) / 2;

  roundRect(ctx, x, y, width, height, size * 0.5);
  ctx.fillStyle = 'rgba(12, 8, 26, 0.45)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 216, 138, 0.22)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size * 0.7}px system-ui, sans-serif`;
  ctx.fillStyle = ACCENT;
  ctx.fillText('WORLD BOARD', layout.width / 2, y + size * 0.75);

  if (shown.length === 0) {
    ctx.font = `400 ${size * 0.72}px system-ui, sans-serif`;
    ctx.fillStyle = DIM;
    ctx.fillText(emptyLine(world), layout.width / 2, y + size * 1.45 + rowHeight / 2);
    return;
  }

  const left = x + size;
  const right = x + width - size;

  shown.forEach((row, index) => {
    const rowY = y + size * 1.45 + rowHeight * index + rowHeight / 2;
    const mine = row.you;

    ctx.font = `700 ${size * 0.72}px system-ui, sans-serif`;
    ctx.fillStyle = mine ? ACCENT : index === 0 ? ACCENT : DIM;
    ctx.textAlign = 'left';
    ctx.fillText(`${row.rank}`, left, rowY);

    ctx.fillStyle = mine ? ACCENT : INK;
    ctx.fillText(row.initials, left + size * 1.4, rowY);

    ctx.textAlign = 'right';
    ctx.font = `600 ${size * 0.72}px system-ui, sans-serif`;
    ctx.fillText(formatScore(row.score), right, rowY);
  });

  ctx.textAlign = 'center';
}

function emptyLine(world: TitleBoard): string {
  if (world.status === 'loading') return 'Asking the world...';
  if (world.status === 'error') return 'Could not reach the board.';
  return 'Nobody has posted a score yet.';
}

/**
 * Draw the level grid and return the tappable regions.
 * Returning hotspots rather than handling input here keeps drawing pure.
 */
export function drawLevelSelect(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  save: SaveData,
  selected: number,
): Hotspot[] {
  const size = scaleOf(layout);
  ctx.fillStyle = '#120c22';
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size * 1.3}px system-ui, sans-serif`;
  ctx.fillStyle = ACCENT;
  ctx.fillText('CHOOSE A LEVEL', layout.width / 2, size * 1.6);

  const columns = 3;
  const top = size * 3.2;
  const available = layout.height - top - size * 2;
  const rowHeight = available / WORLD_COUNT;
  const cardW = Math.min((layout.width - size * 4) / columns, size * 9);
  const cardH = Math.min(rowHeight - size * 0.9, size * 5);
  const gapX = (layout.width - cardW * columns) / (columns + 1);

  const hotspots: Hotspot[] = [];

  LEVELS.forEach((level, index) => {
    const row = level.world - 1;
    const column = index % columns;
    const x = gapX + column * (cardW + gapX);
    const y = top + row * rowHeight;
    const unlocked = level.world <= save.unlockedWorld;
    const record = save.levels[level.id];

    hotspots.push({ x, y, w: cardW, h: cardH, index });
    drawCard(ctx, { x, y, w: cardW, h: cardH }, size, {
      level,
      unlocked,
      record,
      focused: index === selected,
    });
  });

  ctx.font = `400 ${size * 0.8}px system-ui, sans-serif`;
  ctx.fillStyle = DIM;
  ctx.fillText(
    `Bones collected: ${save.totalBones}`,
    layout.width / 2,
    layout.height - size * 1.1,
  );

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  return hotspots;
}

interface CardContent {
  readonly level: (typeof LEVELS)[number];
  readonly unlocked: boolean;
  readonly record: SaveData['levels'][string] | undefined;
  readonly focused: boolean;
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  size: number,
  content: CardContent,
): void {
  const theme = THEMES[content.level.world - 1];
  const radius = size * 0.5;

  ctx.beginPath();
  ctx.moveTo(box.x + radius, box.y);
  ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, radius);
  ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, radius);
  ctx.arcTo(box.x, box.y + box.h, box.x, box.y, radius);
  ctx.arcTo(box.x, box.y, box.x + box.w, box.y, radius);
  ctx.closePath();

  ctx.fillStyle = content.unlocked ? '#1e1436' : '#150e28';
  ctx.fill();
  ctx.lineWidth = content.focused ? 3 : 1.5;
  ctx.strokeStyle = content.focused ? ACCENT : content.unlocked ? '#3d2c66' : '#241a3d';
  ctx.stroke();

  const cx = box.x + box.w / 2;

  if (!content.unlocked) {
    ctx.fillStyle = '#5a4a7d';
    ctx.font = `600 ${size * 0.85}px system-ui, sans-serif`;
    ctx.fillText('LOCKED', cx, box.y + box.h / 2);
    return;
  }

  // A colour chip so each world is recognisable at a glance.
  ctx.fillStyle = theme?.ground.top ?? ACCENT;
  ctx.fillRect(box.x + size * 0.5, box.y + size * 0.55, size * 0.4, size * 0.4);

  ctx.fillStyle = INK;
  ctx.font = `700 ${size * 0.9}px system-ui, sans-serif`;
  ctx.fillText(content.level.name, cx, box.y + size * 0.9);

  ctx.font = `400 ${size * 0.72}px system-ui, sans-serif`;
  ctx.fillStyle = DIM;
  ctx.fillText(theme?.name ?? '', cx, box.y + size * 1.95);

  // Chase levels are flagged, so picking one is never a surprise.
  if (content.level.chase !== undefined) {
    const label = 'CHASE!';
    ctx.font = `800 ${size * 0.6}px system-ui, sans-serif`;
    const pillW = ctx.measureText(label).width + size * 0.7;
    const pillH = size * 0.95;
    // On its own row under the world name: in the top corner it ran straight
    // through the longer level titles.
    const pillX = box.x + (box.w - pillW) / 2;
    const pillY = box.y + size * 2.5;

    ctx.beginPath();
    ctx.roundRect?.(pillX, pillY, pillW, pillH, pillH / 2);
    if (!ctx.roundRect) ctx.rect(pillX, pillY, pillW, pillH);
    ctx.fillStyle = '#e2564a';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + size * 0.02);
  }

  ctx.font = `400 ${size * 0.72}px system-ui, sans-serif`;
  if (content.record?.completed) {
    ctx.fillStyle = ACCENT;
    ctx.fillText(
      `${formatScore(content.record.bestScore)}  ${formatTime(content.record.bestTimeMs)}`,
      cx,
      box.y + box.h - size * 0.9,
    );
  } else {
    ctx.fillStyle = '#6d5b93';
    ctx.fillText('not finished yet', cx, box.y + box.h - size * 0.9);
  }
}

export function hitHotspot(hotspots: readonly Hotspot[], x: number, y: number): number | null {
  for (const spot of hotspots) {
    if (x >= spot.x && x <= spot.x + spot.w && y >= spot.y && y <= spot.y + spot.h) {
      return spot.index;
    }
  }
  return null;
}
