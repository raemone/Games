/**
 * The server keeps its own copy of the level table, so this is the test that
 * stops the copy from rotting: it imports the game's real levels and insists
 * the two agree. Adding a level or retuning a clock in the game fails here
 * until the server is told about it.
 */
import { describe, expect, it } from 'vitest';
import { LEVELS as GAME_LEVELS } from '../../games/roxy-run/src/levels';
import { LEVELS as SERVER_LEVELS, levelById } from '../src/levels';

describe('the server level table', () => {
  it('matches the game, id for id and clock for clock', () => {
    expect(SERVER_LEVELS.map((level) => ({ id: level.id, timeLimit: level.timeLimit }))).toEqual(
      GAME_LEVELS.map((level) => ({ id: level.id, timeLimit: level.timeLimit })),
    );
  });

  it('finds a level by id and refuses one that does not exist', () => {
    expect(levelById('w2-3')?.timeLimit).toBe(460);
    expect(levelById('w4-1')).toBeUndefined();
  });
});
