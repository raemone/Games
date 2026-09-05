/**
 * What the server knows about the nine levels.
 *
 * This is deliberately a copy of the game's own level table rather than an
 * import: the deployed function is built from this directory alone, so it
 * cannot reach into `games/roxy-run/`. `test/levels.test.ts` imports the real
 * table and fails the build if the two ever drift apart.
 *
 * The server needs the ids to reject boards that do not exist, and the time
 * limits to reject a run that claims to have taken longer than the level
 * allows - a client is never trusted to police itself.
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
