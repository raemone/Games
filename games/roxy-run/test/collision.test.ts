import { describe, expect, it } from 'vitest';
import { TILE, findCeiling, findFloor, isWallAt } from '../src/game/collision';
import { tileMap } from './helpers';

const FLAT = tileMap([
  '          ',
  '          ',
  '##########',
]);

describe('findFloor', () => {
  it('finds the surface below a sensor', () => {
    const hit = findFloor(FLAT, 40, 16, 32);
    expect(hit).not.toBeNull();
    expect(hit?.y).toBe(32);
    expect(hit?.distance).toBe(16);
    expect(hit?.angle).toBe(0);
  });

  it('ignores ground further away than maxDistance', () => {
    expect(findFloor(FLAT, 40, 0, 8)).toBeNull();
  });

  it('reports a negative distance when the sensor is buried', () => {
    const hit = findFloor(FLAT, 40, 40, 16);
    expect(hit?.y).toBe(32);
    expect(hit?.distance).toBe(-8);
  });

  it('returns null past the level edge', () => {
    expect(findFloor(FLAT, -1, 16, 32)).toBeNull();
    expect(findFloor(FLAT, 10 * TILE, 16, 32)).toBeNull();
  });

  it('finds nothing over a pit', () => {
    const map = tileMap([
      '     ',
      '     ',
      '## ##',
    ]);
    expect(findFloor(map, 40, 16, 32)).toBeNull();
  });
});

describe('slopes', () => {
  // '/' rises to the right, so its surface angle is negative in screen coords.
  const RAMP = tileMap([
    '    ',
    '  / ',
    '####',
  ]);

  it('gives a rising ramp a negative angle', () => {
    const hit = findFloor(RAMP, 2 * TILE + 8, 16, 32);
    expect(hit?.angle).toBeCloseTo(-Math.PI / 4, 5);
  });

  it('gives a falling ramp a positive angle', () => {
    const fall = tileMap(['    ', '  L ', '####']);
    const hit = findFloor(fall, 2 * TILE + 8, 16, 32);
    expect(hit?.angle).toBeCloseTo(Math.PI / 4, 5);
  });

  it('reports a higher surface further up the ramp', () => {
    const low = findFloor(RAMP, 2 * TILE + 2, 16, 32);
    const high = findFloor(RAMP, 2 * TILE + 14, 16, 32);
    expect(high?.y).toBeLessThan(low?.y ?? 0);
  });
});

describe('walls and ceilings', () => {
  it('treats full blocks as walls but not ramps', () => {
    const map = tileMap(['#/']);
    expect(isWallAt(map, 4, 4)).toBe(true);
    expect(isWallAt(map, TILE + 4, 4)).toBe(false);
  });

  it('treats the level edges as solid so nothing walks off the side', () => {
    const map = tileMap(['  ']);
    expect(isWallAt(map, -1, 4)).toBe(true);
    expect(isWallAt(map, 2 * TILE, 4)).toBe(true);
  });

  it('reports the underside of a ceiling the head has entered', () => {
    const map = tileMap(['##', '  ', '##']);
    expect(findCeiling(map, 8, 14, 8)).toBe(TILE);
  });

  it('ignores a ceiling the head has not reached yet', () => {
    const map = tileMap(['##', '  ', '##']);
    expect(findCeiling(map, 8, 20, 0)).toBeNull();
  });

  it('catches a ceiling that a fast jump would otherwise skip through', () => {
    const map = tileMap(['  ', '##', '  ', '  ']);
    // Head ends up above the ceiling entirely, having crossed it in one tick.
    expect(findCeiling(map, 8, 10, 40)).toBe(2 * TILE);
  });

  it('does not treat a one-way platform as a ceiling', () => {
    const map = tileMap(['==', '  ']);
    expect(findCeiling(map, 8, 14, 8)).toBeNull();
  });
});
