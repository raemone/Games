import { describe, expect, it } from 'vitest';
import type { Layout } from '../src/engine/renderer';
import { padButtons } from '../src/engine/input';

function layoutOf(width: number, height: number, insets = { top: 0, right: 0, bottom: 0, left: 0 }): Layout {
  return { width, height, scale: 1, offsetX: 0, offsetY: 0, insets };
}

/** A phone held sideways, notch on one edge and home indicator on the bottom. */
const PHONE = layoutOf(896, 414, { top: 50, right: 50, bottom: 21, left: 0 });
const TABLET = layoutOf(1180, 820);

const padFor = (layout: Layout) => padButtons(layout, false);

describe('touch pad placement', () => {
  it('sits above the home indicator rather than under it', () => {
    for (const layout of [PHONE, TABLET]) {
      for (const button of padFor(layout)) {
        expect(button.y + button.radius).toBeLessThanOrEqual(layout.height - layout.insets.bottom);
      }
    }
  });

  it('stays clear of the notch on either side', () => {
    for (const button of padFor(PHONE)) {
      expect(button.x - button.radius).toBeGreaterThanOrEqual(PHONE.insets.left);
      expect(button.x + button.radius).toBeLessThanOrEqual(PHONE.width - PHONE.insets.right);
    }
  });

  it('rests near the bottom, where a thumb already is', () => {
    // Within a tenth of the height of the safe bottom edge, not floating in
    // the middle of the picture.
    const floor = PHONE.height - PHONE.insets.bottom;
    for (const button of padFor(PHONE)) {
      expect(floor - (button.y + button.radius)).toBeLessThan(PHONE.height * 0.1);
    }
  });

  it('keeps every button big enough for a thumb', () => {
    for (const layout of [PHONE, TABLET, layoutOf(568, 320)]) {
      for (const button of padFor(layout)) {
        expect(button.radius * 2).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('does not let the buttons overlap each other', () => {
    const buttons = padFor(PHONE);
    for (const a of buttons) {
      for (const b of buttons) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.radius + b.radius);
      }
    }
  });
});
