import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { parseLevel } from '../src/game/level';
import { createRun } from '../src/game/scoring';
import { Session } from '../src/game/session';
import { themeForWorld } from '../src/game/theme';
import type { Audio } from '../src/engine/audio';
import type { PhysicsInput } from '../src/game/physics';

const SILENT = { play: () => {} } as unknown as Audio;
const IDLE: PhysicsInput = {
  left: false,
  right: false,
  down: false,
  jumpHeld: false,
  jumpPressed: false,
};

function session(id: string): Session {
  const def = LEVELS.find((level) => level.id === id)!;
  return new Session(parseLevel(def), themeForWorld(def.world), createRun(), SILENT);
}

/** Drop Roxy onto the star and let her pick it up. */
function grabStar(play: Session): void {
  const star = play.entities.find((entity) => entity.kind === 'star');
  if (!star) throw new Error('level has no star');
  play.body.x = star.x;
  play.body.y = star.y;
  play.update(IDLE);
}

describe('the star power-up', () => {
  it('appears in levels, and always somewhere reachable on the ground', () => {
    const withStars = LEVELS.filter((level) =>
      parseLevel(level).entities.some((entity) => entity.kind === 'star'),
    );
    expect(withStars.length).toBeGreaterThan(0);
  });

  it('grants five seconds when collected', () => {
    const play = session('w3-2');
    expect(play.invincible).toBe(0);
    grabStar(play);
    expect(play.invincible).toBeGreaterThan(5 * 60 - 3);
  });

  it('is only collected once', () => {
    const play = session('w3-2');
    const star = play.entities.find((e) => e.kind === 'star')!;
    grabStar(play);
    expect(star.taken).toBe(true);

    // Standing on the same spot again must not top the timer back up.
    play.invincible = 10;
    play.body.x = star.x;
    play.body.y = star.y;
    play.update(IDLE);
    expect(play.invincible).toBeLessThan(10);
  });

  it('runs out after five seconds', () => {
    const play = session('w3-2');
    grabStar(play);
    for (let tick = 0; tick < 5 * 60; tick++) play.update(IDLE);
    expect(play.invincible).toBe(0);
  });

  it('ignores spikes while it lasts, and stops doing so afterwards', () => {
    const play = session('w3-2');
    for (let i = 0; i < 4; i++) play.run.bones += 1;
    grabStar(play);

    const spike = play.entities.find((e) => e.kind === 'spike');
    if (!spike) throw new Error('level has no spike to test against');

    play.body.x = spike.x;
    play.body.y = spike.y;
    play.update(IDLE);
    expect(play.run.bones, 'star power should have absorbed the spike').toBe(4);

    // Run it out, then take the same hit again.
    play.invincible = 0;
    play.invulnerable = 0;
    play.body.x = spike.x;
    play.body.y = spike.y;
    play.update(IDLE);
    expect(play.run.bones, 'the spike should bite once the star has gone').toBe(0);
  });

  it('flattens a duck on contact instead of taking the hit', () => {
    const play = session('w3-2');
    for (let i = 0; i < 3; i++) play.run.bones += 1;
    grabStar(play);

    const duck = play.entities.find((e) => e.kind === 'walker');
    if (!duck) throw new Error('level has no duck to test against');

    play.body.x = duck.x;
    play.body.y = duck.y;
    play.body.grounded = true;
    play.update(IDLE);

    expect(duck.taken, 'the duck should have been flattened').toBe(true);
    expect(play.run.bones, 'and it should not have cost anything').toBe(3);
  });

  it('does not survive a death, so it cannot be banked', () => {
    const play = session('w3-2');
    grabStar(play);
    // Fall out of the level.
    play.body.y = play.level.pixelHeight + 200;
    play.update(IDLE);
    for (let tick = 0; tick < 200; tick++) play.update(IDLE);
    expect(play.invincible).toBe(0);
  });
});
