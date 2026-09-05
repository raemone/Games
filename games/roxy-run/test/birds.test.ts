import { describe, expect, it } from 'vitest';
import { createEntities, updateEntity, type Entity, type Target } from '../src/game/entities';
import { parseLevel, type LevelDef } from '../src/game/level';
import { tileMap } from './helpers';

const FLOOR = '#'.repeat(40);
const SKY = ' '.repeat(40);

/** A bare level with one bird in it, so behaviour can be watched in isolation. */
function perch(char: string): { entity: Entity; map: ReturnType<typeof tileMap> } {
  const pad = (row: string): string => row.padEnd(40, ' ');
  const rows = [
    SKY,
    SKY,
    pad(`     ${char}`),
    SKY,
    SKY,
    pad(' P                            G'),
    FLOOR,
    FLOOR,
  ];
  const def: LevelDef = { id: 'test', name: 'test', world: 1, timeLimit: 60, rows };
  const level = parseLevel(def);
  const entity = createEntities(level).find((e) => e.kind !== 'goal');
  if (!entity) throw new Error('fixture has no bird');
  return { entity, map: level.map };
}

/** Somewhere far away and harmless. */
const AWAY: Target = { x: 2000, y: 2000 };

/** Mirrors FALCON_PERCH_BOB - how far a waiting falcon drifts. */
const FALCON_BOB = 3;

function run(entity: Entity, map: ReturnType<typeof tileMap>, target: Target, ticks: number): void {
  for (let i = 0; i < ticks; i++) updateEntity(entity, map, target);
}

describe('pigeons', () => {
  it('fly dead level, with no bob to time', () => {
    const { entity, map } = perch('p');
    const heights = new Set<number>();
    for (let i = 0; i < 240; i++) {
      updateEntity(entity, map, AWAY);
      heights.add(Math.round(entity.y));
    }
    expect(heights.size, 'a pigeon should hold one height').toBe(1);
  });

  it('turn back rather than drifting away', () => {
    const { entity, map } = perch('p');
    const home = entity.homeX;
    let furthest = 0;
    for (let i = 0; i < 2000; i++) {
      updateEntity(entity, map, AWAY);
      furthest = Math.max(furthest, Math.abs(entity.x - home));
    }
    expect(furthest).toBeLessThan(80);
  });
});

describe('falcons', () => {
  it('sit still while nobody is underneath', () => {
    const { entity, map } = perch('F');
    run(entity, map, AWAY, 300);
    expect(entity.diving).toBe(false);
    expect(entity.windup).toBe(0);
    expect(Math.abs(entity.y - entity.homeY)).toBeLessThan(FALCON_BOB + 2);
  });

  it('telegraph before they commit, rather than dropping instantly', () => {
    const { entity, map } = perch('F');
    const below: Target = { x: entity.x, y: entity.y + 90 };

    updateEntity(entity, map, below);
    expect(entity.windup, 'the wind-up should start').toBeGreaterThan(0);
    expect(entity.diving, 'but the dive should not have').toBe(false);

    // Still only winding up half way through.
    run(entity, map, below, 10);
    expect(entity.diving).toBe(false);
  });

  it('stoop once the wind-up finishes', () => {
    const { entity, map } = perch('F');
    const below: Target = { x: entity.x, y: entity.y + 90 };
    const startY = entity.y;

    run(entity, map, below, 60);
    expect(entity.y, 'the falcon should have dropped').toBeGreaterThan(startY + 20);
  });

  it('pull out and climb back to the perch', () => {
    const { entity, map } = perch('F');
    const below: Target = { x: entity.x, y: entity.y + 90 };
    const home = entity.homeY;

    // Far enough for the stoop to have happened and bottomed out.
    let lowest = entity.y;
    for (let i = 0; i < 90; i++) {
      updateEntity(entity, map, below);
      lowest = Math.max(lowest, entity.y);
    }
    expect(lowest, 'it should have dropped well below the perch').toBeGreaterThan(home + 20);

    // Leave, and give it time to recover.
    run(entity, map, AWAY, 400);
    expect(entity.diving).toBe(false);
    expect(Math.abs(entity.y - home)).toBeLessThan(FALCON_BOB + 2);
  });

  it('ignore someone above them, so they never dive upward', () => {
    const { entity, map } = perch('F');
    const above: Target = { x: entity.x, y: entity.y - 60 };
    run(entity, map, above, 200);
    expect(entity.diving).toBe(false);
    expect(entity.windup).toBe(0);
  });

  it('ignore someone below but far to the side', () => {
    const { entity, map } = perch('F');
    const aside: Target = { x: entity.x + 400, y: entity.y + 90 };
    run(entity, map, aside, 200);
    expect(entity.diving).toBe(false);
  });

  it('face the way they are about to stoop', () => {
    const { entity, map } = perch('F');
    updateEntity(entity, map, { x: entity.x - 60, y: entity.y + 90 });
    expect(entity.facing).toBe(-1);
    updateEntity(entity, map, { x: entity.x + 60, y: entity.y + 90 });
    expect(entity.facing).toBe(1);
  });
});
