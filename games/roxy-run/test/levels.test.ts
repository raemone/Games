import { describe, expect, it } from 'vitest';
import { LEVELS, WORLD_COUNT, levelById, levelsForWorld, nextLevel } from '../src/levels';
import { parseLevel } from '../src/game/level';
import { TILE, findFloor } from '../src/game/collision';
import { GROUND_ROW, SEGMENTS, SEGMENT_HEIGHT, SEGMENT_WIDTH } from '../src/levels/segments';
import { flyingReach, isEnemy, isFlying } from '../src/game/entities';

/** Clear ground a pit needs in front of it, so the jump can be built up to. */
const RUN_UP = 140;

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

describe('hazard placement', () => {
  /**
   * Being hit knocks Roxy backwards and only slightly upward, so a flyer whose
   * patrol reaches open air is a death trap however well the player jumps -
   * you lose the bones and the fall. Flyers must stay over ground they could
   * land on, across their whole patrol rather than only where they spawn.
   */
  it.each(CASES)('%s keeps every flying enemy over solid ground', (_id, level) => {
    const parsed = parseLevel(level);
    for (const flyer of parsed.entities.filter((e) => isFlying(e.kind))) {
      const reach = flyingReach(flyer.kind);
      for (const offset of [-reach, 0, reach]) {
        const ground = findFloor(parsed.map, flyer.x + offset, flyer.y, parsed.pixelHeight);
        expect(ground, `flyer at x=${flyer.x} (offset ${offset}) is over a pit`).not.toBeNull();
      }
    }
  });

  /**
   * The approach to a pit has to be empty.
   *
   * A crate or spike there stops Roxy dead, so she reaches the edge with no
   * speed. A duck or a flyer is worse: bopping one launches her into an arc
   * she cannot steer, and at low speed that arc ends in the hole. Either way
   * the jump becomes unmakeable however well the level is played.
   */
  it.each(CASES)('%s leaves a clean run-up to every pit', (_id, level) => {
    const parsed = parseLevel(level);
    const groundY = GROUND_ROW * TILE - 8;
    const isPit = (x: number): boolean =>
      x >= 0 && x < parsed.pixelWidth && findFloor(parsed.map, x, groundY, parsed.pixelHeight) === null;

    const blockers = parsed.entities.filter(
      (e) => e.kind === 'crate' || e.kind === 'spike' || isEnemy(e.kind),
    );
    for (let x = TILE; x < parsed.pixelWidth; x += TILE) {
      // The left lip of a pit: solid here, open air one tile on.
      if (isPit(x) || !isPit(x + TILE)) continue;
      for (const blocker of blockers) {
        // Flying enemies roam, so the whole patrol has to clear the approach.
        const reach = isFlying(blocker.kind) ? flyingReach(blocker.kind) : 0;
        const distance = x - (blocker.x - reach);
        expect(
          distance > 0 && distance < RUN_UP,
          `${level.id}: ${blocker.kind} at x=${blocker.x} is ${Math.round(distance)}px before the pit at x=${x}`,
        ).toBe(false);
      }
    }
  });

  it.each(CASES)('%s gives spikes a way past them', (_id, level) => {
    const parsed = parseLevel(level);
    for (const spike of parsed.entities.filter((e) => e.kind === 'spike')) {
      // A spike bed wider than a jump would be impassable. Six tiles is well
      // inside what Roxy clears from a standstill.
      const run = parsed.entities.filter(
        (e) => e.kind === 'spike' && Math.abs(e.y - spike.y) < 8 && e.x >= spike.x && e.x < spike.x + TILE * 6,
      );
      expect(run.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('level density', () => {
  it('gives every level a decent amount to do', () => {
    for (const level of LEVELS) {
      const parsed = parseLevel(level);
      const things = parsed.entities.filter(
        (e) => e.kind === 'crate' || isEnemy(e.kind),
      );
      expect(things.length, `${level.id} feels empty`).toBeGreaterThanOrEqual(8);
    }
  });

  it('keeps the first level the gentlest of the nine', () => {
    const hazardsIn = (id: string): number => {
      const parsed = parseLevel(LEVELS.find((l) => l.id === id)!);
      return parsed.entities.filter((e) => e.kind === 'spike' || isEnemy(e.kind)).length;
    };
    const first = hazardsIn('w1-1');
    for (const level of LEVELS.slice(1)) {
      expect(first, `w1-1 is busier than ${level.id}`).toBeLessThanOrEqual(hazardsIn(level.id));
    }
  });
});
