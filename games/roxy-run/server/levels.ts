/**
 * What the API knows about the nine levels.
 *
 * A deliberate copy of the game's own table rather than an import of it. The
 * functions are bundled and shipped on their own, and reaching sideways into
 * `src/` to read one number per level drags the game's module graph into that
 * bundle - which is both more to go wrong at deploy time and more to load on
 * every cold start.
 *
 * `test/server/levels.test.ts` imports the real table and fails the build if
 * the two ever disagree, so the copy cannot rot. Tests are not deployed, so
 * that import costs the function nothing.
 */

export interface ServerLevel {
  readonly id: string;
  /** Seconds, matching the game's own limit for the level. */
  readonly timeLimit: number;
}

export const LEVELS: readonly ServerLevel[] = [
  { id: 'w1-1', timeLimit: 420 },
  { id: 'w1-2', timeLimit: 420 },
  { id: 'w1-3', timeLimit: 440 },
  { id: 'w2-1', timeLimit: 440 },
  { id: 'w2-2', timeLimit: 450 },
  { id: 'w2-3', timeLimit: 460 },
  { id: 'w3-1', timeLimit: 450 },
  { id: 'w3-2', timeLimit: 460 },
  { id: 'w3-3', timeLimit: 480 },
];

export function levelById(id: string): ServerLevel | undefined {
  return LEVELS.find((level) => level.id === id);
}
