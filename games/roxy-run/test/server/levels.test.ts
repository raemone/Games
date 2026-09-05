/**
 * The API keeps its own copy of the level table so the deployed function does
 * not have to pull in the game's module graph. This is the test that stops the
 * copy from rotting: it imports the real table and insists the two agree, so
 * adding a level or retuning a clock fails here until the API is told.
 *
 * The import is test-only. Nothing here is deployed.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS as GAME_LEVELS } from '../../src/levels';
import { LEVELS as API_LEVELS, levelById } from '../../server/levels';

describe('the API level table', () => {
  it('matches the game, id for id and clock for clock', () => {
    expect(API_LEVELS.map((level) => ({ id: level.id, timeLimit: level.timeLimit }))).toEqual(
      GAME_LEVELS.map((level) => ({ id: level.id, timeLimit: level.timeLimit })),
    );
  });

  it('finds a level by id and refuses one that does not exist', () => {
    expect(levelById('w2-3')?.timeLimit).toBe(460);
    expect(levelById('w4-1')).toBeUndefined();
  });
});
