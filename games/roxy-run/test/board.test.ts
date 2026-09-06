import { describe, expect, it } from 'vitest';
import type { Layout } from '../src/engine/renderer';
import type { BoardView } from '../src/game/board';
import { ALPHABET, boardFrame, stepCharacter, visibleRows } from '../src/game/board';
import { uiScale } from '../src/game/ui';

describe('stepCharacter', () => {
  it('walks the alphabet in both directions', () => {
    expect(stepCharacter('A', 1)).toBe('B');
    expect(stepCharacter('B', -1)).toBe('A');
  });

  it('wraps around either end rather than sticking', () => {
    expect(stepCharacter('A', -1)).toBe('9');
    expect(stepCharacter('9', 1)).toBe('A');
  });

  it('runs letters into digits, so a child can pick a number', () => {
    expect(stepCharacter('Z', 1)).toBe('0');
  });

  it('treats an unknown character as the start of the wheel', () => {
    expect(stepCharacter('!', 1)).toBe('B');
  });

  it('only offers characters the server will accept', () => {
    expect(ALPHABET).toMatch(/^[A-Z0-9]+$/);
  });
});

/** A layout as the renderer would report it, at a size worth testing. */
function layoutOf(width: number, height: number, insets = { top: 0, right: 0, bottom: 0, left: 0 }): Layout {
  return { width, height, scale: 1, offsetX: 0, offsetY: 0, insets };
}

/** A phone held sideways: short, and with a notch eating an eighth of it. */
const PHONE = layoutOf(896, 414, { top: 50, right: 50, bottom: 21, left: 0 });
const LAPTOP = layoutOf(1440, 810);

/** A full board, as the server would send one. */
function viewOf(count: number, yours = -1): BoardView {
  const entries = Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    initials: 'AAA',
    playerId: `p${i}`,
    score: 1000 - i,
    timeMs: 60_000,
    you: i + 1 === yours,
  }));
  return {
    levelName: 'Morning Walk',
    status: 'ready',
    board: { levelId: 'w1-1', players: count, entries, you: entries[yours - 1] ?? null },
  };
}

const SCREENS = [PHONE, LAPTOP, layoutOf(1024, 360, { top: 40, right: 0, bottom: 16, left: 0 })];

describe('boardFrame', () => {
  it('keeps the panel clear of the buttons under it, on every screen', () => {
    for (const layout of SCREENS) {
      for (const count of [0, 1, 5, 10]) {
        const { panel, buttonsY } = boardFrame(layout, viewOf(count));
        const buttonTop = buttonsY - uiScale(layout) * 1.2;
        expect(panel.y + panel.h).toBeLessThanOrEqual(buttonTop);
      }
    }
  });

  it('keeps the buttons clear of the home indicator', () => {
    for (const layout of SCREENS) {
      const { buttonsY } = boardFrame(layout, viewOf(10));
      expect(buttonsY + uiScale(layout) * 1.2).toBeLessThan(layout.height - layout.insets.bottom);
    }
  });

  it('starts the panel below the notch', () => {
    expect(boardFrame(PHONE, viewOf(10)).panel.y).toBeGreaterThan(PHONE.insets.top);
  });

  it('drops rows a phone cannot show, and keeps the ones a laptop can', () => {
    expect(boardFrame(PHONE, viewOf(10)).rows.length).toBeLessThan(10);
    expect(boardFrame(LAPTOP, viewOf(10)).rows).toHaveLength(10);
  });

  it('sizes the panel to the rows in it rather than to the space available', () => {
    const few = boardFrame(LAPTOP, viewOf(3)).panel.h;
    const many = boardFrame(LAPTOP, viewOf(8)).panel.h;
    expect(few).toBeLessThan(many);
  });

  it('says nothing about rows while the board is still loading', () => {
    const loading = boardFrame(PHONE, { levelName: 'Morning Walk', status: 'loading', board: null });
    expect(loading.rows).toHaveLength(0);
    expect(loading.panel.h).toBeGreaterThan(0);
  });
});

describe('visibleRows', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((rank) => ({ rank, you: false }));

  it('takes the top of the board when everything fits', () => {
    expect(visibleRows(rows, 10)).toHaveLength(7);
  });

  it('cuts to the rows that fit', () => {
    expect(visibleRows(rows, 3).map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('shows the player their own row rather than the one that would push it off', () => {
    const mine = rows.map((row) => (row.rank === 6 ? { ...row, you: true } : row));
    expect(visibleRows(mine, 3).map((row) => row.rank)).toEqual([1, 2, 6]);
  });

  it('leaves the top alone when the player is already on it', () => {
    const mine = rows.map((row) => (row.rank === 2 ? { ...row, you: true } : row));
    expect(visibleRows(mine, 3).map((row) => row.rank)).toEqual([1, 2, 3]);
  });
});
