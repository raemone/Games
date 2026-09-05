/**
 * The nine levels, each an ordered list of segments.
 *
 * The ramp is deliberate: world 1 teaches one idea at a time with flat running
 * room between hazards, world 2 leans on the ice physics, and world 3 stacks
 * things together. Every level opens with `start` (the only segment with a
 * spawn) and closes with `finish` (the only one with a goal).
 */
import type { LevelDef } from '../game/level';
import { buildRows, type SegmentName } from './segments';

interface LevelPlan {
  readonly id: string;
  readonly name: string;
  readonly world: number;
  /** Seconds. Generous - running out of time should be rare for a child. */
  readonly timeLimit: number;
  /** Pixels per tick for the world's chase finale. Omit for a normal level. */
  readonly chase?: number;
  readonly segments: readonly SegmentName[];
}

const PLANS: readonly LevelPlan[] = [
  {
    id: 'w1-1',
    name: 'Morning Walk',
    world: 1,
    timeLimit: 320,
    segments: ['start', 'flat', 'meadow', 'hill', 'crates', 'flat', 'checkpoint', 'spring', 'pigeons', 'meadow', 'slope', 'flat', 'checkpoint', 'hill', 'spring', 'meadow', 'finish'],
  },
  {
    id: 'w1-2',
    name: 'Squirrel Trouble',
    world: 1,
    timeLimit: 320,
    segments: ['start', 'hill', 'flat', 'meadow', 'gap', 'walkers', 'checkpoint', 'slope', 'pigeons', 'spikes', 'crateyard', 'flat', 'checkpoint', 'spring', 'hill', 'meadow', 'finish'],
  },
  {
    id: 'w1-3',
    name: 'The Long Field',
    world: 1,
    timeLimit: 340,
    chase: 2.3,
    segments: ['start', 'boost', 'hill', 'flat', 'flyers', 'crates', 'checkpoint', 'gap', 'duckpond', 'meadow', 'spring', 'pigeons', 'checkpoint', 'dip', 'slope', 'meadow', 'finish'],
  },
  {
    id: 'w2-1',
    name: 'First Snow',
    world: 2,
    timeLimit: 340,
    segments: ['start', 'slope', 'flat', 'hill', 'duckpond', 'meadow', 'checkpoint', 'dip', 'gap', 'towers', 'pigeons', 'flat', 'checkpoint', 'spring', 'hill', 'meadow', 'finish'],
  },
  {
    id: 'w2-2',
    name: 'Frozen Ridge',
    world: 2,
    timeLimit: 350,
    segments: ['start', 'hill', 'spikes', 'ride', 'crateyard', 'meadow', 'checkpoint', 'climb', 'flyers', 'falcons', 'slope', 'bridge', 'checkpoint', 'gap', 'spring', 'meadow', 'finish'],
  },
  {
    id: 'w2-3',
    name: 'Avalanche Run',
    world: 2,
    timeLimit: 360,
    chase: 2.6,
    segments: ['start', 'boost', 'dip', 'gap', 'duckpond', 'meadow', 'checkpoint', 'split', 'flyers', 'hill', 'falcons', 'crates', 'checkpoint', 'ride', 'slope', 'meadow', 'finish'],
  },
  {
    id: 'w3-1',
    name: 'Sandy Paws',
    world: 3,
    timeLimit: 350,
    segments: ['start', 'flat', 'crates', 'hill', 'spikes', 'meadow', 'checkpoint', 'spring', 'gap', 'towers', 'falcons', 'walkers', 'checkpoint', 'pigeons', 'slope', 'meadow', 'finish'],
  },
  {
    id: 'w3-2',
    name: 'Pier Pressure',
    world: 3,
    timeLimit: 360,
    segments: ['start', 'slope', 'flyers', 'ride', 'duckpond', 'meadow', 'checkpoint', 'climb', 'gauntlet', 'aviary', 'boost', 'split', 'checkpoint', 'bridge', 'falcons', 'meadow', 'finish'],
  },
  {
    id: 'w3-3',
    name: 'Sunset Sprint',
    world: 3,
    timeLimit: 380,
    chase: 2.9,
    segments: ['start', 'boost', 'hill', 'flat', 'gap', 'crateyard', 'flyers', 'checkpoint', 'split', 'aviary', 'gauntlet', 'towers', 'checkpoint', 'falcons', 'ride', 'meadow', 'finish'],
  },
];

export const LEVELS: readonly LevelDef[] = PLANS.map((plan) => ({
  id: plan.id,
  name: plan.name,
  world: plan.world,
  timeLimit: plan.timeLimit,
  ...(plan.chase === undefined ? {} : { chase: plan.chase }),
  rows: buildRows(plan.segments),
}));

export const WORLD_COUNT = 3;

export function levelsForWorld(world: number): readonly LevelDef[] {
  return LEVELS.filter((level) => level.world === world);
}

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id);
}

/** The level after this one, or undefined when the game is finished. */
export function nextLevel(id: string): LevelDef | undefined {
  const index = LEVELS.findIndex((level) => level.id === id);
  if (index < 0) return undefined;
  return LEVELS[index + 1];
}
