/**
 * The world board, and the arcade initials entry that feeds it.
 *
 * Both are drawn the same way as the rest of the menus: in CSS pixels, with
 * every control returned as a tappable region rather than handled here, so a
 * child on a tablet and a parent on a laptop get the same screen.
 *
 * Initials rather than names on purpose. Three characters is the arcade
 * convention this game is already pretending to be from, it needs no keyboard
 * on a tablet, and it is the smallest thing that can identify a player on a
 * public board - which is exactly as much as a leaderboard has any business
 * knowing about an eight-year-old.
 */
import type { Layout } from '../engine/renderer';
import type { Board, BoardRow } from '../engine/leaderboard';
import { formatScore, formatTime } from './scoring';
import { type UiButton, roundRect, uiScale } from './ui';

const INK = '#f4ecff';
const DIM = '#9c8bc0';
const ACCENT = '#ffd88a';
const PANEL = '#1b1030';

/** The characters an initial can be, in the order the up arrow walks them. */
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export type BoardStatus = 'loading' | 'ready' | 'error';

export interface BoardView {
  readonly levelName: string;
  readonly status: BoardStatus;
  readonly board: Board | null;
}

/** Step one slot of the initials to the next character, wrapping at both ends. */
export function stepCharacter(character: string, delta: number): string {
  const index = ALPHABET.indexOf(character);
  const next = ((index < 0 ? 0 : index) + delta + ALPHABET.length) % ALPHABET.length;
  return ALPHABET[next] ?? 'A';
}

export interface BoardFrame {
  readonly panel: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Middle of the row of controls under the panel. */
  readonly buttonsY: number;
  /** The entries that fit, which may be fewer than the board returned. */
  readonly rows: readonly BoardRow[];
  readonly rowHeight: number;
}

/** The level name above the rows, and the player count below them. */
const CHROME = 4.2;

/**
 * The whole layout of the board screen, worked out in one place.
 *
 * Everything is placed from the edges inwards rather than at a fraction of the
 * height, because a phone held sideways is mostly notch and home bar: on one,
 * a fraction that leaves room on a laptop puts the panel underneath its own
 * buttons. Drawing and hit-testing both come through here, so the tappable
 * regions cannot drift away from what is drawn.
 */
export function boardFrame(layout: Layout, view: BoardView): BoardFrame {
  const size = uiScale(layout);

  // Up from the bottom: the safe area, the corner buttons, a gap, then the row
  // of controls. That is as low as the panel is ever allowed to reach.
  const corners = size * 0.8 + size * 0.78 * 1.1;
  const floor = layout.height - layout.insets.bottom - corners - size * 2;

  const x = Math.max(size, (layout.width - size * 26) / 2);
  const y = layout.insets.top + size * 2.4;
  const room = Math.max(size * 5, floor - size * 2 - y);

  // Only as many rows as the panel can hold at a legible height. Squeezing ten
  // into a phone's panel is not showing ten scores, it is showing a smudge.
  const space = room - size * CHROME;
  const entries = view.status === 'ready' ? (view.board?.entries ?? []) : [];
  const rows = visibleRows(entries, Math.max(1, Math.floor(space / (size * 1.5))));
  const rowHeight = rows.length === 0 ? 0 : Math.min(space / rows.length, size * 1.9);

  // The panel is as tall as its contents rather than as tall as it may be: a
  // hand of empty rows under the last score reads as a board that gave up
  // halfway through loading.
  const h = rows.length === 0 ? Math.min(room, size * 7) : size * CHROME + rows.length * rowHeight;

  return {
    panel: { x, y, w: layout.width - x * 2, h },
    // Tucked under the panel, unless the safe area wants them higher.
    buttonsY: Math.min(floor, y + h + size * 2),
    rows,
    rowHeight,
  };
}

/** Clear the screen and draw the empty panel. */
function panel(ctx: CanvasRenderingContext2D, layout: Layout, frame: BoardFrame): void {
  ctx.fillStyle = '#120c22';
  ctx.fillRect(0, 0, layout.width, layout.height);

  const { x, y, w, h } = frame.panel;
  roundRect(ctx, x, y, w, h, uiScale(layout) * 0.6);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#3d2c66';
  ctx.stroke();
}

/**
 * Draw one level's board. Every state gets a sentence rather than an empty
 * panel: waiting, unreachable and nobody-yet look identical otherwise, and the
 * difference is the only thing a player actually wants to know.
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  view: BoardView,
  frame: BoardFrame,
): void {
  const size = uiScale(layout);
  const { panel: box, rows: shown, rowHeight } = frame;
  panel(ctx, layout, frame);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size * 1.3}px system-ui, sans-serif`;
  ctx.fillStyle = ACCENT;
  ctx.fillText('WORLD BOARD', layout.width / 2, layout.insets.top + size * 1.2);

  ctx.font = `600 ${size * 0.95}px system-ui, sans-serif`;
  ctx.fillStyle = INK;
  ctx.fillText(view.levelName, layout.width / 2, box.y + size * 1.3);

  if (shown.length === 0) {
    ctx.font = `400 ${size * 0.9}px system-ui, sans-serif`;
    ctx.fillStyle = DIM;
    ctx.fillText(emptyMessage(view), layout.width / 2, box.y + box.h * 0.6);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    return;
  }

  const top = box.y + size * 2.6;
  const left = box.x + size;
  const right = box.x + box.w - size;

  shown.forEach((row, index) => {
    const y = top + rowHeight * index + rowHeight / 2;
    const mine = row.you;

    if (mine) {
      roundRect(ctx, left - size * 0.4, y - rowHeight / 2 + 1, right - left + size * 0.8, rowHeight - 2, size * 0.35);
      ctx.fillStyle = 'rgba(255, 216, 138, 0.14)';
      ctx.fill();
    }

    ctx.font = `700 ${size * 0.85}px system-ui, sans-serif`;
    ctx.fillStyle = index === 0 ? ACCENT : mine ? ACCENT : DIM;
    ctx.textAlign = 'left';
    ctx.fillText(`${row.rank}`.padStart(2, ' '), left, y);

    ctx.fillStyle = mine ? ACCENT : INK;
    ctx.fillText(row.initials, left + size * 2.2, y);

    ctx.textAlign = 'right';
    ctx.font = `600 ${size * 0.85}px system-ui, sans-serif`;
    ctx.fillText(formatScore(row.score), right - size * 4.2, y);

    ctx.fillStyle = DIM;
    ctx.font = `400 ${size * 0.8}px system-ui, sans-serif`;
    ctx.fillText(formatTime(row.timeMs), right, y);
  });

  ctx.textAlign = 'center';
  ctx.font = `400 ${size * 0.78}px system-ui, sans-serif`;
  ctx.fillStyle = DIM;
  ctx.fillText(footer(view.board, shown), layout.width / 2, box.y + box.h - size * 0.9);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

function emptyMessage(view: BoardView): string {
  if (view.status === 'loading') return 'Asking the world...';
  if (view.status === 'error') return 'Could not reach the board. Try again later.';
  return 'Nobody has finished this one yet. Be first!';
}

/**
 * The rows to draw when only `count` of them fit.
 *
 * The top `count`, except that the player's own row displaces the last one
 * when it would otherwise fall off: someone who opens the board to find their
 * place should see it, and the printed rank says the list skipped ahead.
 */
export function visibleRows<T extends { readonly you: boolean }>(
  rows: readonly T[],
  count: number,
): readonly T[] {
  const shown = rows.slice(0, count);
  if (shown.some((row) => row.you)) return shown;
  const mine = rows.find((row) => row.you);
  if (!mine || shown.length < count) return shown;
  return [...shown.slice(0, count - 1), mine];
}

/**
 * The line under the table. A player outside the rows on screen came here to
 * find out where they actually are, so their own place is worth more than a
 * total.
 */
function footer(board: Board | null, shown: readonly { readonly you: boolean }[]): string {
  if (!board) return '';
  const players = `${board.players} ${board.players === 1 ? 'player' : 'players'}`;
  const you = board.you;
  if (!you) return players;
  const listed = shown.some((row) => row.you);
  return listed ? `You are ${you.initials} · ${players}` : `You: #${you.rank} of ${board.players}`;
}

export interface InitialsView {
  /** Exactly three characters, one per slot. */
  readonly characters: readonly string[];
  /** Which slot the arrows are currently changing. */
  readonly slot: number;
  readonly tick: number;
  /** Shown under the slots: why the game is asking. */
  readonly note: string;
}

/**
 * The initials picker: three slots, an up and a down arrow each.
 *
 * Arrows rather than a text field because a text field on a tablet opens a
 * keyboard over the game, and because three characters chosen from a wheel
 * cannot contain an email address, a full name, or most of what you would
 * rather a child did not type into a public box.
 */
export function drawInitials(ctx: CanvasRenderingContext2D, layout: Layout, view: InitialsView): UiButton[] {
  const size = uiScale(layout);
  ctx.fillStyle = 'rgba(10, 6, 20, 0.92)';
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size * 1.3}px system-ui, sans-serif`;
  ctx.fillStyle = ACCENT;
  ctx.fillText('YOUR INITIALS', layout.width / 2, layout.height * 0.2);

  const cell = Math.min(size * 3.2, layout.width / 6);
  const gap = size * 0.8;
  const total = cell * 3 + gap * 2;
  const startX = layout.width / 2 - total / 2;
  const centreY = layout.height * 0.47;
  const arrow = cell * 0.62;

  const buttons: UiButton[] = [];

  for (let slot = 0; slot < 3; slot++) {
    const x = startX + slot * (cell + gap);
    const focused = slot === view.slot;

    const up = { id: `up${slot}`, x, y: centreY - cell / 2 - arrow - gap * 0.4, w: cell, h: arrow };
    const down = { id: `down${slot}`, x, y: centreY + cell / 2 + gap * 0.4, w: cell, h: arrow };
    buttons.push(up, down, { id: `slot${slot}`, x, y: centreY - cell / 2, w: cell, h: cell });

    drawChevron(ctx, up, focused, -1);
    drawChevron(ctx, down, focused, 1);

    roundRect(ctx, x, centreY - cell / 2, cell, cell, size * 0.4);
    ctx.fillStyle = focused ? 'rgba(255, 216, 138, 0.14)' : 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    ctx.lineWidth = focused ? 3 : 1.5;
    ctx.strokeStyle = focused ? ACCENT : '#4a3675';
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `800 ${cell * 0.62}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // The focused slot blinks, which is what says "this is the one you are
    // changing" without a caret to draw.
    ctx.globalAlpha = focused ? 0.55 + Math.sin(view.tick / 9) * 0.45 : 1;
    ctx.fillText(view.characters[slot] ?? 'A', x + cell / 2, centreY);
    ctx.globalAlpha = 1;
  }

  ctx.font = `400 ${size * 0.8}px system-ui, sans-serif`;
  ctx.fillStyle = DIM;
  ctx.fillText(view.note, layout.width / 2, centreY + cell / 2 + arrow + size * 2.2);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  return buttons;
}

function drawChevron(ctx: CanvasRenderingContext2D, button: UiButton, focused: boolean, direction: 1 | -1): void {
  const cx = button.x + button.w / 2;
  const cy = button.y + button.h / 2;
  const r = Math.min(button.w, button.h) * 0.28;

  roundRect(ctx, button.x, button.y, button.w, button.h, r * 0.8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fill();

  // The arms sit on the side the arrow comes from, so the point leads the way
  // the button moves the letter: -1 draws a chevron pointing up, 1 down.
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - (r * 0.5 * direction));
  ctx.lineTo(cx, cy + (r * 0.5 * direction));
  ctx.lineTo(cx + r, cy - (r * 0.5 * direction));
  ctx.lineWidth = Math.max(2, r * 0.32);
  ctx.strokeStyle = focused ? ACCENT : DIM;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
