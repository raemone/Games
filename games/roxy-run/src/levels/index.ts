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
  readonly segments: readonly SegmentName[];
}

const PLANS: readonly LevelPlan[] = [
  {
    id: 'w1-1',
    name: 'Morning Walk',
    world: 1,
    timeLimit: 240,
    segments: ['start', 'flat', 'hill', 'flat', 'walkers', 'checkpoint', 'hill', 'spring', 'flat', 'slope', 'finish'],
  },
  {
    id: 'w1-2',
    name: 'Squirrel Trouble',
    world: 1,
    timeLimit: 240,
    segments: ['start', 'hill', 'flat', 'gap', 'walkers', 'checkpoint', 'slope', 'spikes', 'split', 'spring', 'finish'],
  },
  {
    id: 'w1-3',
    name: 'The Long Field',
    world: 1,
    timeLimit: 260,
    segments: ['start', 'boost', 'hill', 'flat', 'flyers', 'crates', 'checkpoint', 'gap', 'walkers', 'spring', 'dip', 'finish'],
  },
  {
    id: 'w2-1',
    name: 'First Snow',
    world: 2,
    timeLimit: 260,
    segments: ['start', 'slope', 'flat', 'hill', 'walkers', 'checkpoint', 'dip', 'gap', 'flat', 'spring', 'finish'],
  },
  {
    id: 'w2-2',
    name: 'Frozen Ridge',
    world: 2,
    timeLimit: 270,
    segments: ['start', 'hill', 'spikes', 'ride', 'flat', 'checkpoint', 'climb', 'flyers', 'slope', 'spring', 'gap', 'finish'],
  },
  {
    id: 'w2-3',
    name: 'Avalanche Run',
    world: 2,
    timeLimit: 280,
    segments: ['start', 'boost', 'dip', 'gap', 'walkers', 'checkpoint', 'split', 'flyers', 'hill', 'crates', 'ride', 'finish'],
  },
  {
    id: 'w3-1',
    name: 'Sandy Paws',
    world: 3,
    timeLimit: 270,
    segments: ['start', 'flat', 'crates', 'hill', 'spikes', 'checkpoint', 'spring', 'gap', 'slope', 'walkers', 'finish'],
  },
  {
    id: 'w3-2',
    name: 'Pier Pressure',
    world: 3,
    timeLimit: 290,
    segments: ['start', 'slope', 'flyers', 'ride', 'walkers', 'checkpoint', 'climb', 'spikes', 'boost', 'split', 'gap', 'finish'],
  },
  {
    id: 'w3-3',
    name: 'Sunset Sprint',
    world: 3,
    timeLimit: 300,
    segments: ['start', 'boost', 'hill', 'flat', 'gap', 'crates', 'flyers', 'checkpoint', 'split', 'spikes', 'ride', 'dip', 'finish'],
  },
];

export const LEVELS: readonly LevelDef[] = PLANS.map((plan) => ({
  id: plan.id,
  name: plan.name,
  world: plan.world,
  timeLimit: plan.timeLimit,
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
