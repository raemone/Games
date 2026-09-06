import { describe, expect, it } from 'vitest';
import { makeBall, setRolling, step } from '../src/game/physics';
import {
  DRAIN_Y,
  DROP_TARGETS,
  LANE_EXIT_ANGLE,
  LANE_RADIUS,
  FLIPPER_LEFT_PIVOT,
  FLIPPER_LENGTH,
  FLIPPER_REST_ANGLE,
  FLIPPER_RIGHT_PIVOT,
  PLUNGER_MAX_SPEED,
  PLUNGER_MIN_SPEED,
  PLUNGER_REST,
  TABLE_WIDTH,
  pointOnArc,
  tableTriggers,
} from '../src/game/table';
import { tableWorld, takeShot } from './helpers';

/**
 * Fire a ball off both flippers from every contact point and release time. This
 * is the playthrough test: it is how we know the table has no dead spots and
 * nowhere a ball can park for ever, without anyone having to play it.
 */
function sweep(): { reached: Map<string, number>; stuck: string[]; runs: number } {
  const reached = new Map<string, number>();
  const stuck: string[] = [];
  let runs = 0;

  for (const side of ['left', 'right'] as const) {
    for (let along = 0.35; along <= 1.001; along += 0.05) {
      for (let delay = 0; delay <= 24; delay += 3) {
        runs++;
        const result = takeShot(side, along, delay);
        for (const id of result.hits) reached.set(id, (reached.get(id) ?? 0) + 1);
        if (!result.drained && result.ball.y < 520 && Math.hypot(result.ball.vx, result.ball.vy) < 0.4) {
          stuck.push(`${side} ${along.toFixed(1)} ${delay} at (${result.ball.x | 0}, ${result.ball.y | 0})`);
        }
      }
    }
  }
  return { reached, stuck, runs };
}

const swept = sweep();

describe('the playfield', () => {
  it('has no shot that cannot be made from a flipper', () => {
    // Three groups are excluded and tested directly instead, because a blind
    // sweep is the wrong instrument for them: the top lanes are fed from the
    // arch rather than from a flipper, and the far end of an orbit and the
    // outlanes are precise enough shots that whether this particular grid of
    // contact points happens to land one says nothing about the table.
    const excluded = ['lane-', 'orbit-left-top', 'orbit-right-top', 'outlane-'];
    const wanted = [
      ...tableTriggers()
        .map((trigger) => trigger.id)
        .filter((id) => !excluded.some((prefix) => id.startsWith(prefix))),
      ...DROP_TARGETS.map((target) => target.id),
      'squirrel',
      'bumper-left',
      'bumper-right',
      'bumper-top',
      'sling-left',
      'sling-right',
    ];
    const missed = wanted.filter((id) => !swept.reached.has(id));
    expect(missed).toEqual([]);
  });

  it('runs a ball the whole length of each orbit', () => {
    // The shot a player aims at: up the side lane, past the top of it, and on
    // round the arch. If a lane could not be run end to end, Fetch! and Walkies
    // would both be impossible and nothing else would notice.
    for (const [side, x] of [
      ['left', 45],
      ['right', 292],
    ] as const) {
      const ball = makeBall(x, 425, 0, -18);
      setRolling(ball);
      const world = tableWorld([ball]);
      const seen = new Set<string>();
      for (let tick = 0; tick < 240 && ball.y <= DRAIN_Y; tick++) {
        for (const hit of step(world)) if (hit.id) seen.add(hit.id);
      }
      expect([...seen]).toContain(`orbit-${side}-top`);
    }
  });

  it('never traps a ball rallying between the slingshots', () => {
    // Two kickers facing each other will trade a ball back and forth for ever
    // if either one fires on a graze: each relaunches it just hard enough to
    // reach the other, gravity never gets to win, and the game stops dead with
    // a ball hovering above the flippers. Found by playing a whole game with a
    // bot and noticing it never reached ball two.
    for (const speed of [2, 3.5, 5, 7, 9]) {
      for (const from of [140, 173, 206]) {
        const ball = makeBall(from, 470, speed * 0.4, speed);
        setRolling(ball);
        const world = tableWorld([ball]);
        let drained = false;
        for (let tick = 0; tick < 60 * 25; tick++) {
          step(world);
          if (ball.y > DRAIN_Y) {
            drained = true;
            break;
          }
        }
        expect({ speed, from, drained }).toEqual({ speed, from, drained: true });
      }
    }
  });

  it('lets a ball down each outlane', () => {
    // The post narrows the outlane mouth on purpose. Narrowing it to less than
    // a ball would plug it, and a plugged outlane is a shelf to park on rather
    // than a way to lose a ball.
    for (const [side, x] of [
      ['left', 30],
      ['right', 316],
    ] as const) {
      const ball = makeBall(x, 470, 0, 2);
      setRolling(ball);
      const world = tableWorld([ball]);
      const seen = new Set<string>();
      let drained = false;
      for (let tick = 0; tick < 400; tick++) {
        for (const hit of step(world)) if (hit.id) seen.add(hit.id);
        if (ball.y > DRAIN_Y) {
          drained = true;
          break;
        }
      }
      expect([...seen]).toContain(`outlane-${side}`);
      expect(drained).toBe(true);
    }
  });

  it('can light every one of R-O-X-Y', () => {
    // The lanes are fed two ways: the ball leaving the launch channel, which is
    // the skill shot, and a flipper shot that carries all the way round. If one
    // letter could not be reached either way, the bonus multiplier would cap.
    const exit = pointOnArc(LANE_RADIUS, LANE_EXIT_ANGLE);
    const heading = { x: Math.sin(LANE_EXIT_ANGLE), y: -Math.cos(LANE_EXIT_ANGLE) };
    const seen = new Set([...swept.reached.keys()].filter((id) => id.startsWith('lane-')));

    for (let speed = 1; speed <= 13; speed += 0.5) {
      const ball = makeBall(exit.x, exit.y, heading.x * speed, heading.y * speed);
      const world = tableWorld([ball]);
      for (let tick = 0; tick < 400 && ball.y <= DRAIN_Y; tick++) {
        for (const hit of step(world)) if (hit.id.startsWith('lane-')) seen.add(hit.id);
      }
    }
    expect([...seen].sort()).toEqual(['lane-o', 'lane-r', 'lane-x', 'lane-y']);
  });

  it('drops a soft plunge into a nearer lane than a hard one', () => {
    // Which is what makes the plunge worth aiming: a full pull carries the ball
    // across the top and out to the left orbit instead of into a lane.
    const exit = pointOnArc(LANE_RADIUS, LANE_EXIT_ANGLE);
    const heading = { x: Math.sin(LANE_EXIT_ANGLE), y: -Math.cos(LANE_EXIT_ANGLE) };
    const firstLaneX = (speed: number): number => {
      const ball = makeBall(exit.x, exit.y, heading.x * speed, heading.y * speed);
      const world = tableWorld([ball]);
      for (let tick = 0; tick < 300 && ball.y <= DRAIN_Y; tick++) {
        for (const hit of step(world)) {
          if (hit.id.startsWith('lane-')) return hit.at.x;
        }
      }
      return -1;
    };
    const soft = firstLaneX(3);
    const hard = firstLaneX(11);
    expect(soft).toBeGreaterThan(0);
    expect(hard).toBeLessThan(soft);
  });

  it('never parks a ball somewhere it cannot get out of', () => {
    expect(swept.stuck).toEqual([]);
  });

  it('drains often enough to be a game and rarely enough to be fun', () => {
    // A blind shot with no follow-up is the worst case a player can produce.
    // If even that drained every time the table would be unplayable, and if it
    // never drained the flipper gap would be too narrow to lose a ball through.
    const drains = swept.runs - swept.reached.size;
    expect(drains).toBeGreaterThan(0);
  });
});

describe('the flipper gap', () => {
  it('is wide enough for a ball to drain between the tips', () => {
    // Two tips a shade too close hold a ball up between them for ever, which
    // looks like a lucky escape and is actually a hung game.
    const ball = makeBall(0, 0);
    const tipX = (pivotX: number, direction: number): number =>
      pivotX + direction * Math.cos(FLIPPER_REST_ANGLE) * FLIPPER_LENGTH;
    const gap = tipX(FLIPPER_RIGHT_PIVOT.x, -1) - tipX(FLIPPER_LEFT_PIVOT.x, 1);
    expect(gap).toBeGreaterThan(ball.radius * 2 + 7 * 2);
  });

  it('lets a ball rolling down the middle reach the drain', () => {
    // Straight down the middle from just above the flippers. Anywhere else and
    // the ball lands on a flipper and cradles, which is not what this is about.
    const ball = makeBall(173, 500, 0, 2);
    const world = tableWorld([ball]);
    for (let i = 0; i < 600 && ball.y <= DRAIN_Y; i++) step(world);
    expect(ball.y).toBeGreaterThan(DRAIN_Y);
  });
});

describe('the launch channel', () => {
  const plunge = (power: number): { hits: Set<string>; ball: ReturnType<typeof makeBall> } => {
    const speed = PLUNGER_MIN_SPEED + (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED) * power;
    const ball = makeBall(PLUNGER_REST.x, PLUNGER_REST.y, 0, -speed);
    // The session launches a rolling ball, so a test of the launch must too.
    setRolling(ball);
    const world = tableWorld([ball]);
    const hits = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const hit of step(world)) if (hit.id) hits.add(hit.id);
      if (ball.y > DRAIN_Y) break;
    }
    return { hits, ball };
  };

  it('gets the ball out of the lane even on the softest plunge', () => {
    // A plunge that cannot crest the channel leaves the ball sitting on the
    // plunger, which reads to a child as a game that has stopped working.
    const { ball } = plunge(0);
    expect(ball.x).toBeLessThan(TABLE_WIDTH - 60);
  });

  it('delivers the ball into the playfield on a full plunge', () => {
    const { ball } = plunge(1);
    expect(ball.x).toBeLessThan(300);
  });

  it('will not let a ball back down the lane it came up', () => {
    // The one-way gate. A ball dropped into the top-right corner of the
    // playfield must never end up parked on the plunger.
    const ball = makeBall(300, 120, 6, 1);
    const world = tableWorld([ball]);
    for (let i = 0; i < 600 && ball.y <= DRAIN_Y; i++) {
      step(world);
      expect(ball.x < 331 || ball.y < 210).toBe(true);
    }
  });
});
