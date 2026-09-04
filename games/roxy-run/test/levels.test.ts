import { describe, expect, it } from 'vitest';
import { LEVELS, WORLD_COUNT, levelById, levelsForWorld, nextLevel } from '../src/levels';
import { parseLevel } from '../src/game/level';
import { findFloor } from '../src/game/collision';
import { GROUND_ROW, SEGMENTS, SEGMENT_HEIGHT, SEGMENT_WIDTH } from '../src/levels/segments';

const CASES = LEVELS.map((level) => [level.id, level] as const);

describe('level data', () => {
  it('has three levels in each of the three worlds', () => {
    expect(LEVELS).toHaveLength(WORLD_COUNT * 3);
    for (let world = 1; world <= WORLD_COUNT; world++) {
      expect(levelsForWorld(world)).toHaveLength(3);
    }
  });

  it('uses unique ids', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it('chains from the first level to the last and then stops', () => {
    let id: string | undefined = LEVELS[0]?.id;
    const seen: string[] = [];
    while (id) {
      seen.push(id);
      id = nextLevel(id)?.id;
    }
    expect(seen).toEqual(LEVELS.map((l) => l.id));
  });

  it.each(CASES)('%s parses', (_id, level) => {
    expect(() => parseLevel(level)).not.toThrow();
  });

  it.each(CASES)('%s spawns Roxy above solid ground', (_id, level) => {
    const parsed = parseLevel(level);
    // A spawn over a pit would drop the player the instant the level started.
    expect(findFloor(parsed.map, parsed.spawn.x, parsed.spawn.y, 96)).not.toBeNull();
  });

  it.each(CASES)('%s has exactly one goal, reachable in the time limit', (_id, level) => {
    const parsed = parseLevel(level);
    expect(parsed.entities.filter((e) => e.kind === 'goal')).toHaveLength(1);
    expect(parsed.pixelWidth).toBeGreaterThan(3000);
    // Even at a flat-out sprint the level must fit the clock with room to spare.
    expect(parsed.pixelWidth / 6 / 60).toBeLessThan(level.timeLimit);
  });

  it.each(CASES)('%s has a checkpoint and plenty to collect', (_id, level) => {
    const parsed = parseLevel(level);
    expect(parsed.entities.some((e) => e.kind === 'checkpoint')).toBe(true);
    expect(parsed.entities.filter((e) => e.kind === 'bone').length).toBeGreaterThan(10);
  });
});

describe('lookup', () => {
  it('finds a level by id', () => {
    expect(levelById('w2-2')?.name).toBe('Frozen Ridge');
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(levelById('nope')).toBeUndefined();
    expect(nextLevel('nope')).toBeUndefined();
  });
});

describe('segment geometry', () => {
  const NAMES = Object.keys(SEGMENTS) as (keyof typeof SEGMENTS)[];

  it.each(NAMES)('%s joins flush at both edges', (name) => {
    // Every segment must present solid ground at exactly GROUND_ROW on both
    // outer columns. Segments are butted together, so a segment whose floor
    // sits a row lower creates a step that a running player wedges against -
    // which is invisible in the ASCII and painful to find by playing.
    const rows = SEGMENTS[name];
    for (const column of [0, SEGMENT_WIDTH - 1]) {
      expect(rows[GROUND_ROW]?.[column], `${name} column ${column} at ground row`).toBe('#');
      expect(rows[GROUND_ROW - 1]?.[column], `${name} column ${column} above ground`).toBe(' ');
    }
  });

  it.each(NAMES)('%s is the standard size', (name) => {
    const rows = SEGMENTS[name];
    expect(rows).toHaveLength(SEGMENT_HEIGHT);
    for (const row of rows) expect(row).toHaveLength(SEGMENT_WIDTH);
  });
});
