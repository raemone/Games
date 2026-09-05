import { describe, expect, it } from 'vitest';
import { createEntities, updateEntity, type Entity, type Target } from '../src/game/entities';
import { parseLevel, type LevelDef } from '../src/game/level';
import { LEVELS } from '../src/levels';
import { Session } from '../src/game/session';
import { createRun } from '../src/game/scoring';
import { themeForWorld } from '../src/game/theme';
import type { Audio } from '../src/engine/audio';

const SILENT = { play: () => {} } as unknown as Audio;
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

describe('killing birds', () => {
  /**
   * Pigeons and falcons were added to the enemy predicate but never to the
   * collision switch, so for a while they were simply intangible - you could
   * stand inside one and nothing happened, in either direction. These pin both
   * halves down: they can be killed, and they can hurt you.
   */
  function levelWith(kind: 'pigeon' | 'falcon' | 'flyer'): Session {
    const def = LEVELS.find((level) =>
      parseLevel(level).entities.some((entity) => entity.kind === kind),
    );
    if (!def) throw new Error(`no level contains a ${kind}`);
    return new Session(parseLevel(def), themeForWorld(def.world), createRun(), SILENT);
  }

  const IDLE = { left: false, right: false, down: false, jumpHeld: false, jumpPressed: false };

  it.each(['pigeon', 'falcon', 'flyer'] as const)('a jump kills a %s and scores', (kind) => {
    const play = levelWith(kind);
    const bird = play.entities.find((entity) => entity.kind === kind)!;
    const before = play.run.score;

    play.body.x = bird.x;
    play.body.y = bird.y;
    play.body.grounded = false;
    play.body.ysp = -2; // rising into it, not falling onto it
    play.update(IDLE);

    expect(bird.taken, `a jumped-into ${kind} should die`).toBe(true);
    expect(play.run.score, 'and it should be worth points').toBeGreaterThan(before);
  });

  it('a falcon is worth more than a pigeon', () => {
    const score = (kind: 'pigeon' | 'falcon'): number => {
      const play = levelWith(kind);
      const bird = play.entities.find((entity) => entity.kind === kind)!;
      play.body.x = bird.x;
      play.body.y = bird.y;
      play.body.grounded = false;
      play.body.ysp = -2;
      play.update(IDLE);
      return play.run.score;
    };
    expect(score('falcon')).toBeGreaterThan(score('pigeon'));
  });

  /**
   * A bird flying at Roxy's own height over flat ground, which is the case
   * that has to hurt. Built as its own level rather than by teleporting her
   * onto a bird: the physics step runs before the collision check, so a
   * teleport into mid-air makes her airborne and she kills it instead.
   */
  function lowBird(char: string): { play: Session; bird: Entity } {
    const pad = (row: string): string => row.padEnd(30, ' ');
    const rows = [
      ' '.repeat(30),
      ' '.repeat(30),
      ' '.repeat(30),
      pad(` P        ${char}            G`),
      '#'.repeat(30),
      '#'.repeat(30),
    ];
    const def: LevelDef = { id: 'low', name: 'low', world: 1, timeLimit: 60, rows };
    const level = parseLevel(def);
    const play = new Session(level, themeForWorld(1), createRun(), SILENT);
    const bird = play.entities.find((entity) => entity.kind !== 'goal');
    if (!bird) throw new Error('fixture has no bird');
    return { play, bird };
  }

  it.each([
    ['pigeon', 'p'],
    ['falcon', 'F'],
  ] as const)('a %s still hurts you on the ground', (_name, char) => {
    const { play, bird } = lowBird(char);
    for (let i = 0; i < 4; i++) play.run.bones += 1;

    // Let her settle on the floor, then walk into the bird.
    for (let tick = 0; tick < 40; tick++) play.update(IDLE);
    expect(play.body.grounded, 'she should be standing').toBe(true);

    for (let tick = 0; tick < 200 && play.run.bones > 0; tick++) {
      play.update({ left: false, right: true, down: false, jumpHeld: false, jumpPressed: false });
    }

    expect(bird.taken, 'it should not die to a grounded touch').toBe(false);
    expect(play.run.bones, 'and it should cost the bones').toBe(0);
  });
});
