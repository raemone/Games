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
    timeLimit: 420,
    segments: ['start', 'flat', 'hill', 'crates', 'meadow', 'pigeons', 'flat', 'spring', 'slope', 'crates', 'meadow', 'walkers', 'hill', 'flat', 'spring', 'meadow', 'crates', 'slope', 'pigeons', 'flat', 'hill', 'meadow', 'spring', 'crates', 'meadow', 'finish'],
  },
  {
    id: 'w1-2',
    name: 'Squirrel Trouble',
    world: 1,
    timeLimit: 420,
    segments: ['start', 'hill', 'flat', 'gap', 'walkers', 'meadow', 'slope', 'pigeons', 'spikes', 'flat', 'crateyard', 'spring', 'hill', 'meadow', 'dip', 'crates', 'split', 'flat', 'spikes', 'meadow', 'pigeons', 'slope', 'spring', 'hill', 'meadow', 'finish'],
  },
  {
    id: 'w1-3',
    name: 'The Long Field',
    world: 1,
    timeLimit: 440,
    chase: 2.3,
    segments: ['start', 'boost', 'hill', 'flat', 'flyers', 'crates', 'meadow', 'gap', 'duckpond', 'flat', 'spring', 'pigeons', 'meadow', 'dip', 'slope', 'crates', 'walkers', 'flat', 'spring', 'hill', 'meadow', 'split', 'flat', 'crates', 'meadow', 'finish'],
  },
  {
    id: 'w2-1',
    name: 'First Snow',
    world: 2,
    timeLimit: 440,
    segments: ['start', 'slope', 'flat', 'hill', 'duckpond', 'meadow', 'dip', 'gap', 'towers', 'flat', 'pigeons', 'spring', 'hill', 'meadow', 'crates', 'walkers', 'slope', 'flat', 'ride', 'meadow', 'crateyard', 'spring', 'hill', 'flat', 'meadow', 'finish'],
  },
  {
    id: 'w2-2',
    name: 'Frozen Ridge',
    world: 2,
    timeLimit: 450,
    segments: ['start', 'hill', 'spikes', 'ride', 'crateyard', 'meadow', 'climb', 'flyers', 'falcons', 'slope', 'bridge', 'flat', 'gap', 'spring', 'meadow', 'towers', 'crates', 'pigeons', 'hill', 'flat', 'spikes', 'meadow', 'split', 'spring', 'meadow', 'finish'],
  },
  {
    id: 'w2-3',
    name: 'Avalanche Run',
    world: 2,
    timeLimit: 460,
    chase: 2.6,
    segments: ['start', 'boost', 'dip', 'gap', 'duckpond', 'meadow', 'split', 'flyers', 'hill', 'falcons', 'crates', 'flat', 'ride', 'slope', 'meadow', 'towers', 'pigeons', 'spring', 'flat', 'crateyard', 'hill', 'meadow', 'gap', 'flat', 'meadow', 'finish'],
  },
  {
    id: 'w3-1',
    name: 'Sandy Paws',
    world: 3,
    timeLimit: 450,
    segments: ['start', 'flat', 'crates', 'hill', 'spikes', 'meadow', 'spring', 'gap', 'towers', 'falcons', 'walkers', 'flat', 'pigeons', 'slope', 'meadow', 'crateyard', 'ride', 'hill', 'flat', 'gauntlet', 'meadow', 'split', 'spring', 'dip', 'meadow', 'finish'],
  },
  {
    id: 'w3-2',
    name: 'Pier Pressure',
    world: 3,
    timeLimit: 460,
    segments: ['start', 'slope', 'flyers', 'ride', 'duckpond', 'meadow', 'climb', 'gauntlet', 'aviary', 'boost', 'split', 'flat', 'bridge', 'falcons', 'meadow', 'towers', 'crates', 'hill', 'pigeons', 'flat', 'spikes', 'meadow', 'spring', 'gap', 'meadow', 'finish'],
  },
  {
    id: 'w3-3',
    name: 'Sunset Sprint',
    world: 3,
    timeLimit: 480,
    chase: 2.9,
    segments: ['start', 'boost', 'hill', 'flat', 'gap', 'crateyard', 'flyers', 'split', 'aviary', 'gauntlet', 'towers', 'flat', 'falcons', 'ride', 'meadow', 'bridge', 'pigeons', 'hill', 'spikes', 'meadow', 'duckpond', 'spring', 'slope', 'flat', 'meadow', 'finish'],
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
