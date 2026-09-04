/**
 * The three worlds. Everything that differs between them lives here: colours,
 * surface grip, enemy skins and the shapes drawn on the parallax layers. The
 * levels and entity behaviour are shared, so a fourth world is a data change.
 */
import type { SurfaceFeel } from './tiles';
import type { Tune } from '../engine/audio';

export interface Theme {
  readonly id: 1 | 2 | 3;
  readonly name: string;
  readonly feel: SurfaceFeel;
  /** Sky gradient from the top of the screen down. */
  readonly sky: readonly [string, string];
  /** Ground colours: the surface layer, the body beneath, and speckles. */
  readonly ground: { readonly top: string; readonly body: string; readonly deep: string };
  /** Far and near parallax layer colours. */
  readonly far: string;
  readonly near: string;
  /** Decoration drawn on the near layer: trees, peaks or palms. */
  readonly decor: 'tree' | 'peak' | 'palm';
  readonly accent: string;
  readonly tune: Tune;
}

const PARK_TUNE: Tune = {
  bpm: 132,
  lead: [
    'E5', 'G5', 'A5', 'B5', 'A5', 'G5', 'E5', null,
    'D5', 'E5', 'G5', 'A5', 'G5', 'E5', 'D5', null,
    'C5', 'E5', 'G5', 'A5', 'G5', 'E5', 'C5', null,
    'D5', 'G5', 'B5', 'D6', 'B5', 'G5', 'D5', null,
  ],
  bass: ['C3', 'C3', 'G2', 'G2', 'A2', 'A2', 'F2', 'F2', 'C3', 'C3', 'G2', 'G2', 'F2', 'F2', 'G2', 'G2'],
};

const SNOW_TUNE: Tune = {
  bpm: 118,
  lead: [
    'A5', null, 'E5', null, 'A5', 'B5', 'C6', null,
    'B5', null, 'G5', null, 'E5', null, 'D5', null,
    'F5', null, 'C5', null, 'F5', 'G5', 'A5', null,
    'G5', null, 'E5', null, 'D5', 'E5', 'D5', null,
  ],
  bass: ['A2', 'A2', 'E2', 'E2', 'F2', 'F2', 'C3', 'C3', 'D3', 'D3', 'A2', 'A2', 'E2', 'E2', 'E2', 'E2'],
};

const BEACH_TUNE: Tune = {
  bpm: 144,
  lead: [
    'D5', 'F#5', 'A5', 'F#5', 'D5', 'A4', 'D5', null,
    'E5', 'G5', 'B5', 'G5', 'E5', 'B4', 'E5', null,
    'F#5', 'A5', 'D6', 'A5', 'F#5', 'D5', 'F#5', null,
    'G5', 'B5', 'D6', 'B5', 'A5', 'F#5', 'D5', null,
  ],
  bass: ['D3', 'D3', 'A2', 'A2', 'B2', 'B2', 'F#2', 'F#2', 'G2', 'G2', 'D3', 'D3', 'A2', 'A2', 'A2', 'A2'],
};

export const THEMES: readonly Theme[] = [
  {
    id: 1,
    name: 'Green Park',
    feel: { grip: 1, bite: 1 },
    sky: ['#7ecbff', '#d7f3ff'],
    ground: { top: '#6ac04a', body: '#8b5a2b', deep: '#5c3a18' },
    far: '#9adf8a',
    near: '#4e9e46',
    decor: 'tree',
    accent: '#ffd88a',
    tune: PARK_TUNE,
  },
  {
    id: 2,
    name: 'Snowy Peaks',
    // Ice: you slide further and take longer to get going.
    feel: { grip: 0.35, bite: 0.7 },
    sky: ['#8fb7e0', '#e6f2ff'],
    ground: { top: '#f2fbff', body: '#9fb8cc', deep: '#6d8497' },
    far: '#cfe2f5',
    near: '#8fabc4',
    decor: 'peak',
    accent: '#bde6ff',
    tune: SNOW_TUNE,
  },
  {
    id: 3,
    name: 'Beach Sunset',
    // Sand: grippy, so momentum bleeds away if you stop pushing.
    feel: { grip: 1.6, bite: 0.85 },
    sky: ['#ff8f5e', '#ffd9a0'],
    ground: { top: '#f7dda0', body: '#cc9a5c', deep: '#8c6238' },
    far: '#ffb27a',
    near: '#c9713f',
    decor: 'palm',
    accent: '#ff6f91',
    tune: BEACH_TUNE,
  },
];

export function themeForWorld(world: number): Theme {
  return THEMES[Math.min(Math.max(world, 1), THEMES.length) - 1] as Theme;
}
