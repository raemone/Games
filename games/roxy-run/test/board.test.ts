import { describe, expect, it } from 'vitest';
import { ALPHABET, stepCharacter } from '../src/game/board';

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
