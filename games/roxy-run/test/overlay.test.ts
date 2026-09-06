import { describe, expect, it } from 'vitest';
import type { Layout } from '../src/engine/renderer';
import { type OverlayOptions, overlayFrame } from '../src/game/hud';
import { uiScale } from '../src/game/ui';

function layoutOf(width: number, height: number, insets = { top: 0, right: 0, bottom: 0, left: 0 }): Layout {
  return { width, height, scale: 1, offsetX: 0, offsetY: 0, insets };
}

const PHONE = layoutOf(896, 414, { top: 50, right: 50, bottom: 21, left: 0 });
const LAPTOP = layoutOf(1440, 810);
const SCREENS = [PHONE, LAPTOP, layoutOf(1024, 360, { top: 40, right: 0, bottom: 16, left: 0 })];

/** The end-of-level recap at its tallest: bonus line and world rank both in. */
const RECAP: OverlayOptions = {
  title: 'GOOD DOG!',
  buttons: true,
  lines: [
    'Morning Walk',
    'Score 011250',
    'Time 1:13',
    'Fast finish +6920  ·  Bones +270',
    'World rank #2',
  ],
};

/** Half the height of a button in the row under an overlay. */
const halfRow = (layout: Layout): number => uiScale(layout) * 1.2;

describe('overlayFrame', () => {
  it('keeps every line above the buttons, on every screen', () => {
    for (const layout of SCREENS) {
      const frame = overlayFrame(layout, RECAP);
      expect(frame.bottom).toBeLessThanOrEqual(frame.buttonsY - halfRow(layout));
    }
  });

  it('keeps the buttons clear of the home indicator', () => {
    for (const layout of SCREENS) {
      const frame = overlayFrame(layout, RECAP);
      expect(frame.buttonsY + halfRow(layout)).toBeLessThanOrEqual(layout.height - layout.insets.bottom);
    }
  });

  it('keeps the title clear of the notch', () => {
    const { titleY, size } = overlayFrame(PHONE, RECAP);
    expect(titleY - size * 0.95).toBeGreaterThanOrEqual(PHONE.insets.top);
  });

  it('pushes the buttons down as lines are added, rather than drawing over them', () => {
    const short = overlayFrame(LAPTOP, { title: 'GOOD DOG!', buttons: true, lines: ['Morning Walk'] });
    const tall = overlayFrame(LAPTOP, RECAP);
    expect(tall.bottom).toBeGreaterThan(short.bottom);
    expect(tall.buttonsY).toBeGreaterThan(short.buttonsY);
  });

  it('centres the text and the buttons together', () => {
    // The group, not the text alone, sits in the middle of the screen.
    const frame = overlayFrame(LAPTOP, RECAP);
    const top = frame.titleY - frame.size * 0.95;
    const middle = (top + frame.buttonsY + halfRow(LAPTOP)) / 2;
    expect(Math.abs(middle - LAPTOP.height / 2)).toBeLessThan(uiScale(LAPTOP));
  });

  it('does not shrink text that already fits', () => {
    expect(overlayFrame(LAPTOP, RECAP).size).toBe(uiScale(LAPTOP));
    expect(overlayFrame(PHONE, RECAP).size).toBe(uiScale(PHONE));
  });

  it('shrinks the text rather than overflowing when the lines pile up', () => {
    const tiny = layoutOf(568, 300, { top: 30, right: 0, bottom: 12, left: 0 });
    const many: OverlayOptions = { ...RECAP, lines: [...(RECAP.lines ?? []), 'and', 'more', 'lines'] };
    const frame = overlayFrame(tiny, many);
    expect(frame.size).toBeLessThan(uiScale(tiny));
    expect(frame.bottom).toBeLessThanOrEqual(frame.buttonsY - halfRow(tiny));
  });

  it('uses the whole screen when there is no button row', () => {
    const withRow = overlayFrame(LAPTOP, RECAP);
    const without = overlayFrame(LAPTOP, { ...RECAP, buttons: false });
    expect(without.titleY).toBeGreaterThan(withRow.titleY);
  });
});
