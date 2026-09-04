/**
 * The jokes.
 *
 * `emptyLine` picks by hashing the day key rather than at random: a line that
 * changes on every re-render is maddening, and a day should keep its own gag
 * for as long as you are looking at it.
 */

import type { DayKey } from './dates';

const EMPTY_LINES: readonly string[] = [
  'The lawn is suspiciously quiet.',
  'Nothing logged yet. The grass looks nervous.',
  'No treasures found. Yet.',
  'Someone should probably investigate the back fence.',
  'A clean yard, or a cover-up?',
  'Zero. Either a miracle or a delay.',
  'The patrol has not reported in.',
  'All quiet on the western lawn.',
  'Suspiciously spotless. Keep walking.',
  'No finds. The hunt continues.',
  'Nothing here. Check behind the shed.',
  'The yard is holding its breath.',
];

interface Mood {
  readonly emoji: string;
  readonly line: string;
}

function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) % 1_000_003;
  }
  return total;
}

export function emptyLine(day: DayKey): string {
  const fallback = 'Nothing logged yet.';
  if (EMPTY_LINES.length === 0) return fallback;
  return EMPTY_LINES[hash(day) % EMPTY_LINES.length] ?? fallback;
}

/** How the dog is taking today's haul. */
export function roxyMood(dayCount: number, dogName: string): Mood {
  if (dayCount <= 0) return { emoji: '🐕', line: `${dogName} is up to something.` };
  if (dayCount === 1) return { emoji: '🐕', line: 'One down. Good start.' };
  if (dayCount <= 3) return { emoji: '🐶', line: `${dogName} has been busy.` };
  if (dayCount <= 6) return { emoji: '😮', line: `What is ${dogName} eating?` };
  if (dayCount <= 9) return { emoji: '🤯', line: 'This is a lot. Genuinely.' };
  return { emoji: '🏆', line: 'Legendary haul. Take a bow.' };
}

export function goalLine(picked: number, goal: number): string {
  if (picked >= goal) return 'BACKYARD CLEARED! 🎉';
  const left = goal - picked;
  if (left === 1) return '1 to go!';
  return `${left} to go!`;
}
