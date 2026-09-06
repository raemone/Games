import { describe, expect, it } from 'vitest';
import { BALLS_PER_GAME, Session } from '../src/game/session';
import { flipperTip } from '../src/game/physics';
import { DOGHOUSE, DRAIN_Y, PLUNGER_REST, TABLE_HEIGHT, TABLE_WIDTH } from '../src/game/table';
import { NO_INPUT, input, silentAudio } from './helpers';

function newSession(): Session {
  return new Session(silentAudio());
}

/** Flip whenever a ball is in reach, and keep plunging. The attract-mode bot. */
function botInput(session: Session, tick: number) {
  // The flipper is pulsed, not held: a ball cradled on a held flipper stays
  // there for ever, and a bot that never lets go never finishes a game.
  const swing = tick % 26 < 11;
  let left = false;
  let right = false;
  for (const ball of session.activeBalls) {
    for (const flipper of session.flippers) {
      const tip = flipperTip(flipper);
      if (Math.hypot(ball.x - tip.x, ball.y - tip.y) < 48) {
        if (flipper.pivot.x < 173) left = swing;
        else right = swing;
      }
    }
  }
  const phase = tick % 150;
  return input({
    leftFlipper: left,
    rightFlipper: right,
    plungerHeld: phase < 60,
    plungerReleased: phase === 60,
  });
}

function playFor(session: Session, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) session.update(botInput(session, tick));
}

/** Charge the plunger and let it go. */
function launch(session: Session): void {
  for (let i = 0; i < 20; i++) session.update(input({ plungerHeld: true }));
  session.update(input({ plungerReleased: true }));
}

/**
 * Run the table with the ball pinned in open playfield, so a test about timers
 * is not really a test about how long a ball happens to survive.
 */
function hold(session: Session, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    const ball = session.activeBalls[0];
    if (ball) {
      ball.x = 173;
      ball.y = 250;
      ball.vx = 0;
      ball.vy = 0;
    }
    session.update(NO_INPUT);
  }
}

describe('a new game', () => {
  it('starts with a ball on the plunger and nothing else', () => {
    const session = newSession();
    expect(session.phase).toBe('ready');
    expect(session.ballNumber).toBe(1);
    expect(session.ballsLeft).toBe(BALLS_PER_GAME);
    expect(session.activeBalls).toHaveLength(1);
    expect(session.activeBalls[0]?.x).toBeCloseTo(PLUNGER_REST.x);
  });

  it('launches when the plunger is charged and let go', () => {
    const session = newSession();
    for (let i = 0; i < 45; i++) session.update(input({ plungerHeld: true }));
    session.update(input({ plungerReleased: true }));
    expect(session.phase).toBe('playing');
    for (let i = 0; i < 60; i++) session.update(NO_INPUT);
    expect(session.activeBalls[0]?.y).toBeLessThan(PLUNGER_REST.y - 100);
  });

  it('launches on its own if nobody touches the plunger', () => {
    // A ball parked on the plunger for ever reads to a child as a game that
    // has broken, so the table sends it after ten seconds whatever they do.
    const session = newSession();
    for (let i = 0; i < 11 * 60; i++) session.update(NO_INPUT);
    expect(session.phase).toBe('playing');
  });
});

describe('a whole game', () => {
  const session = newSession();
  playFor(session, 60 * 60 * 4);

  it('ends after its balls are used up', () => {
    expect(session.phase).toBe('gameOver');
    expect(session.ballsLeft).toBeLessThanOrEqual(0);
  });

  it('scores something along the way', () => {
    expect(session.score.score).toBeGreaterThan(0);
  });

  it('never lets a ball leave the table', () => {
    const wanderer = newSession();
    for (let tick = 0; tick < 60 * 90; tick++) {
      wanderer.update(botInput(wanderer, tick));
      for (const ball of wanderer.activeBalls) {
        expect(ball.x).toBeGreaterThan(-20);
        expect(ball.x).toBeLessThan(TABLE_WIDTH + 20);
        expect(ball.y).toBeGreaterThan(-20);
        expect(ball.y).toBeLessThan(TABLE_HEIGHT + 40);
      }
    }
  });

  it('never lets the score go backwards', () => {
    const watched = newSession();
    let best = 0;
    for (let tick = 0; tick < 60 * 90; tick++) {
      watched.update(botInput(watched, tick));
      expect(watched.score.score).toBeGreaterThanOrEqual(best);
      best = watched.score.score;
    }
  });
});

describe('the ball save', () => {
  it('puts a ball straight back after an early drain', () => {
    const session = newSession();
    launch(session);

    const ball = session.activeBalls[0];
    expect(ball).toBeDefined();
    if (!ball) return;
    ball.y = DRAIN_Y + 5;
    session.update(NO_INPUT);

    expect(session.ballNumber).toBe(1);
    expect(session.ballsLeft).toBe(BALLS_PER_GAME);
    expect(session.activeBalls).toHaveLength(1);
  });

  it('runs out, and then a drain costs a ball', () => {
    const session = newSession();
    launch(session);
    hold(session, 60 * 14);
    expect(session.ballSaveLit).toBe(false);

    const ball = session.activeBalls[0];
    if (ball) ball.y = DRAIN_Y + 5;
    session.update(NO_INPUT);
    expect(session.ballNumber).toBe(2);
    expect(session.ballsLeft).toBe(BALLS_PER_GAME - 1);
  });
});

describe('the doghouse', () => {
  function shootTheDoghouse(session: Session): void {
    const ball = session.activeBalls[0];
    if (!ball) throw new Error('no ball');
    ball.x = DOGHOUSE.x;
    ball.y = DOGHOUSE.y;
    ball.vx = 0;
    ball.vy = 0;
    ball.inside.clear();
    session.update(NO_INPUT);
  }

  it('holds the ball, then feeds it back into play', () => {
    const session = newSession();
    launch(session);
    shootTheDoghouse(session);
    expect(session.saucer).not.toBeNull();
    expect(session.activeBalls).toHaveLength(0);

    for (let i = 0; i < 120; i++) session.update(NO_INPUT);
    expect(session.saucer).toBeNull();
    expect(session.activeBalls).toHaveLength(1);
    expect(session.activeBalls[0]?.y).toBeLessThan(DRAIN_Y);
  });

  it('starts the selected mission once the skill shot has passed', () => {
    const session = newSession();
    launch(session);
    // The first doghouse shot after a launch is the skill shot, not a mission.
    hold(session, 7 * 60);

    const selected = session.missions.selected;
    shootTheDoghouse(session);
    expect(session.missions.active?.id).toBe(selected);
  });

  it('pays the skill shot for the first shot after a launch', () => {
    const session = newSession();
    launch(session);
    expect(session.skillShotLit).toBe(true);

    shootTheDoghouse(session);
    expect(session.score.score).toBeGreaterThan(100_000);
    expect(session.missions.active).toBeNull();
  });
});

describe('tilt', () => {
  it('takes several shoves, warns first, and then kills the flippers', () => {
    const session = newSession();
    launch(session);

    for (let i = 0; i < 3; i++) {
      session.update(input({ nudgeLeft: true }));
      expect(session.tilted).toBe(false);
      session.update(NO_INPUT);
    }
    session.update(input({ nudgeRight: true }));
    expect(session.tilted).toBe(true);

    session.update(input({ leftFlipper: true }));
    expect(session.flippers[0]?.held).toBe(false);
  });

  it('clears when the ball drains, rather than ending the game', () => {
    const session = newSession();
    launch(session);
    hold(session, 60 * 14);
    for (let i = 0; i < 6; i++) session.update(input({ nudgeLeft: true }));
    expect(session.tilted).toBe(true);

    const ball = session.activeBalls[0];
    if (ball) ball.y = DRAIN_Y + 5;
    session.update(NO_INPUT);
    expect(session.tilted).toBe(false);
    expect(session.phase).toBe('ready');
  });
});

describe('restart', () => {
  it('puts everything back the way it started', () => {
    const session = newSession();
    playFor(session, 60 * 60);
    session.restart();
    expect(session.score.score).toBe(0);
    expect(session.ballNumber).toBe(1);
    expect(session.ballsLeft).toBe(BALLS_PER_GAME);
    expect(session.missions.completed).toEqual([]);
    expect(session.activeBalls).toHaveLength(1);
    expect(session.phase).toBe('ready');
  });
});
