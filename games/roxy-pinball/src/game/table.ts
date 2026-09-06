/**
 * Roxy's playfield, as data.
 *
 * Every coordinate lives here rather than being scattered through the drawing
 * and the rules, so moving a bumper moves the thing the ball hits, the thing on
 * screen and the thing the mission asks for, all at once.
 *
 * The table is 380 x 680. The arch is centred on the whole table because the
 * launch lane runs up the right-hand side underneath it, but the lower
 * playfield is centred on PLAYFIELD_CENTER instead - which is why the two
 * flippers are symmetric about 173 and not about 190. Real tables are built the
 * same way, and getting it wrong makes one flipper's shots feel wrong.
 */
import type { Post, Trigger, Vec, Wall } from './physics';

export const TABLE_WIDTH = 380;
export const TABLE_HEIGHT = 680;

/** The lower playfield is mirrored about this, not about the table's middle. */
export const PLAYFIELD_CENTER = 173;

/** Below this a ball is gone. It sits under the flippers with room to spare. */
export const DRAIN_Y = 646;

export const ARCH_CENTER: Vec = { x: 190, y: 200 };
export const ARCH_RADIUS = 176;

/**
 * The launch lane is a channel between the outer arch and a second arc 35px
 * inside it: the ball climbs the right-hand side, curves over the top and is
 * spat out heading left, near the apex. Delivering it there rather than at the
 * arch's steep right-hand shoulder is what makes the plunge a skill shot - a
 * soft one dribbles into the near top lane, a hard one carries all the way
 * across to the left orbit.
 */
export const LANE_RADIUS = 141;
/** Where the channel opens into the playfield, as an angle about ARCH_CENTER. */
export const LANE_EXIT_ANGLE = (-100 * Math.PI) / 180;

/** Where the plunger holds a ball, and how hard a full pull launches it. */
export const PLUNGER_REST: Vec = { x: 349, y: 585 };
/** A soft plunge must still crest the channel, or the ball just rolls back. */
export const PLUNGER_MIN_SPEED = 17.2;
export const PLUNGER_MAX_SPEED = 20.5;

/**
 * The flipper gap has to be wider than a ball plus both flipper tips, or a
 * ball rolling down the middle balances on the two tips and never drains -
 * which sounds like a gift and plays like a hang.
 */
export const FLIPPER_LEFT_PIVOT: Vec = { x: 108, y: 548 };
export const FLIPPER_RIGHT_PIVOT: Vec = { x: 238, y: 548 };
export const FLIPPER_LENGTH = 52;
export const FLIPPER_REST_ANGLE = 0.5;
export const FLIPPER_ACTIVE_ANGLE = -0.55;

/** Where a ramp or the doghouse spits the ball back out. */
export const HABITRAIL_LEFT_EXIT: Vec = { x: 70, y: 452 };
export const HABITRAIL_RIGHT_EXIT: Vec = { x: 276, y: 452 };

export interface Bumper {
  readonly id: string;
  readonly center: Vec;
  readonly radius: number;
}

export const BUMPERS: readonly Bumper[] = [
  { id: 'bumper-left', center: { x: 130, y: 228 }, radius: 15 },
  { id: 'bumper-right', center: { x: 216, y: 228 }, radius: 15 },
  { id: 'bumper-top', center: { x: 173, y: 172 }, radius: 15 },
];

export interface DropTarget {
  readonly id: string;
  readonly a: Vec;
  readonly b: Vec;
}

/**
 * The bath brushes. Four of them, stacked down the left of the middle
 * playfield and facing right, so knocking the bank down is a right-flipper
 * skill: a cross-table shot rather than a tap.
 */
export const DROP_TARGETS: readonly DropTarget[] = [
  { id: 'drop-0', a: { x: 88, y: 300 }, b: { x: 88, y: 322 } },
  { id: 'drop-1', a: { x: 88, y: 326 }, b: { x: 88, y: 348 } },
  { id: 'drop-2', a: { x: 88, y: 352 }, b: { x: 88, y: 374 } },
  { id: 'drop-3', a: { x: 88, y: 378 }, b: { x: 88, y: 400 } },
];

/** The squirrel. A standing target on the right, facing the left flipper. */
export const SQUIRREL: DropTarget = {
  id: 'squirrel',
  a: { x: 258, y: 318 },
  b: { x: 258, y: 354 },
};

/** The doghouse saucer: a pocket in the middle that swallows the ball. */
export const DOGHOUSE: Vec = { x: 173, y: 322 };
export const DOGHOUSE_RADIUS = 11;

export const TOP_LANES: readonly { readonly id: string; readonly letter: string; readonly center: Vec }[] = [
  { id: 'lane-r', letter: 'R', center: { x: 87, y: 130 } },
  { id: 'lane-o', letter: 'O', center: { x: 133, y: 130 } },
  { id: 'lane-x', letter: 'X', center: { x: 179, y: 130 } },
  { id: 'lane-y', letter: 'Y', center: { x: 225, y: 130 } },
];

/** The vertical fins between the top lanes. The left lane guide closes the set. */
export const TOP_LANE_DIVIDERS: readonly number[] = [110, 156, 202, 248];
export const TOP_LANE_TOP = 96;
export const TOP_LANE_BOTTOM = 140;

/** The inner wall of each side lane, from the top lanes down to the funnel. */
export const LEFT_GUIDE: readonly [Vec, Vec] = [{ x: 64, y: 96 }, { x: 72, y: 440 }];
export const RIGHT_GUIDE: readonly [Vec, Vec] = [{ x: 288, y: 118 }, { x: 274, y: 440 }];

export function pointOnArc(radius: number, angle: number): Vec {
  return {
    x: ARCH_CENTER.x + Math.cos(angle) * radius,
    y: ARCH_CENTER.y + Math.sin(angle) * radius,
  };
}

/** Chop an arc into chords. At these radii the bump left is a quarter pixel. */
function arc(
  center: Vec,
  radius: number,
  from: number,
  to: number,
  steps: number,
  bounce: number,
): Wall[] {
  const walls: Wall[] = [];
  for (let i = 0; i < steps; i++) {
    const a0 = from + ((to - from) * i) / steps;
    const a1 = from + ((to - from) * (i + 1)) / steps;
    walls.push({
      kind: 'wall',
      a: { x: center.x + Math.cos(a0) * radius, y: center.y + Math.sin(a0) * radius },
      b: { x: center.x + Math.cos(a1) * radius, y: center.y + Math.sin(a1) * radius },
      bounce,
    });
  }
  return walls;
}

function polyline(points: readonly Vec[], bounce: number): Wall[] {
  const walls: Wall[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b) walls.push({ kind: 'wall', a, b, bounce });
  }
  return walls;
}

/** Mirror a point into the other half of the lower playfield. */
export function mirrorX(point: Vec): Vec {
  return { x: PLAYFIELD_CENTER * 2 - point.x, y: point.y };
}

/** The rubber faces of the slingshots, written once and mirrored. */
export const LEFT_SLING = {
  top: { x: 110, y: 442 },
  bottom: { x: 104, y: 506 },
  outer: { x: 152, y: 510 },
} as const;

/** The outer wall down the left of the playfield and into the outlane. */
export const OUTER_LEFT: readonly Vec[] = [
  { x: 14, y: 200 },
  { x: 14, y: 462 },
  { x: 84, y: 566 },
  { x: 92, y: 612 },
];

/** The launch lane: outer edge, floor, and the wall it shares with the table. */
export const LANE_WALL: readonly Vec[] = [
  { x: 366, y: 200 },
  { x: 366, y: 597 },
  { x: 331, y: 597 },
  { x: 331, y: 200 },
];

/** The playfield's right-hand edge below the channel, into the right outlane. */
export const OUTER_RIGHT: readonly Vec[] = [
  { x: 331, y: 462 },
  { x: 262, y: 566 },
  { x: 254, y: 612 },
];

/**
 * The rail that splits each inlane from its outlane. It flattens out at the
 * bottom and ends over the flipper rather than beside its pivot: a rail that
 * stops short of the flipper leaves a notch between the two, and a ball that
 * rolls down the inlane into that notch is a ball the game never gets back.
 */
export const SEPARATOR_LEFT: readonly Vec[] = [
  { x: 48, y: 462 },
  { x: 94, y: 534 },
  { x: 114, y: 540 },
];

/**
 * The pocket the doghouse sits in: two walls and a peaked roof. The peak is not
 * decoration - a flat roof 28 pixels across is exactly wide enough to balance a
 * ball on, and a ball balanced there is a ball nobody can get back.
 */
export const DOGHOUSE_POCKET: readonly Vec[] = [
  { x: 159, y: 340 },
  { x: 159, y: 312 },
  { x: 173, y: 301 },
  { x: 187, y: 312 },
  { x: 187, y: 340 },
];

/** Caps that stop a ball slipping behind a target bank and parking there. */
export const BANK_CAPS: readonly (readonly [Vec, Vec])[] = [
  [{ x: 72, y: 296 }, { x: 88, y: 296 }],
  [{ x: 76, y: 404 }, { x: 88, y: 404 }],
  [{ x: 276, y: 314 }, { x: 258, y: 314 }],
  [{ x: 273, y: 358 }, { x: 258, y: 358 }],
];

/** The rubber that narrows each outlane mouth. */
export const OUTLANE_POST: Vec = { x: 42, y: 452 };
export const OUTLANE_POST_RADIUS = 6;

const SLING_KICK = 5.2;
/** A ball dribbling onto a slingshot should not be fired across the table. */
const SLING_THRESHOLD = 0.9;

function slingshot(side: 'left' | 'right'): Wall[] {
  const flip = side === 'left' ? (p: Vec): Vec => p : mirrorX;
  const top = flip(LEFT_SLING.top);
  const bottom = flip(LEFT_SLING.bottom);
  const outer = flip(LEFT_SLING.outer);
  return [
    // The rubber, and the only edge that kicks.
    {
      kind: 'wall',
      a: side === 'left' ? top : outer,
      b: side === 'left' ? outer : top,
      bounce: 0.5,
      id: `sling-${side}`,
      kick: SLING_KICK,
      kickThreshold: SLING_THRESHOLD,
    },
    // The two dead sides: the inlane's wall, and the roof over the flipper.
    { kind: 'wall', a: top, b: bottom, bounce: 0.3 },
    { kind: 'wall', a: bottom, b: outer, bounce: 0.3 },
  ];
}

/** The outer wall, the lane guides and the funnel down to the flippers. */
function shell(): Wall[] {
  const laneExitInner = pointOnArc(LANE_RADIUS, LANE_EXIT_ANGLE);
  const laneExitOuter = pointOnArc(ARCH_RADIUS, LANE_EXIT_ANGLE);

  const walls: Wall[] = [
    // The outer arch, left wall to right wall over the top. Its right-hand half
    // doubles as the outside of the launch channel.
    ...arc(ARCH_CENTER, ARCH_RADIUS, Math.PI, Math.PI * 2, 44, 0.4),
    // Left edge, then the funnel into the left outlane.
    ...polyline(OUTER_LEFT, 0.35),
    // The launch channel's inner wall: up the right-hand side of the playfield,
    // then curving over the top to the exit.
    ...polyline(LANE_WALL, 0.3),
    ...arc(ARCH_CENTER, LANE_RADIUS, 0, LANE_EXIT_ANGLE, 26, 0.35),
    // The playfield's right edge below the channel, and its funnel.
    ...polyline(OUTER_RIGHT, 0.35),
    // The inlane/outlane separators.
    ...polyline(SEPARATOR_LEFT, 0.3),
    ...polyline(SEPARATOR_LEFT.map(mirrorX), 0.3),
    // The side lane guides.
    ...polyline(LEFT_GUIDE, 0.4),
    ...polyline(RIGHT_GUIDE, 0.4),
    // The top lane fins.
    ...TOP_LANE_DIVIDERS.flatMap((x) =>
      polyline([{ x, y: TOP_LANE_TOP }, { x, y: TOP_LANE_BOTTOM }], 0.4),
    ),
    // Caps above and below each target bank. Without them a ball slips into the
    // sliver between the bank and the lane guide and parks there for ever.
    ...BANK_CAPS.flatMap((cap) => polyline(cap, 0.3)),
    // The doghouse pocket: three sides, with the mouth facing the flippers.
    ...polyline(DOGHOUSE_POCKET, 0.25),
  ];

  // The channel's one-way gate, across its mouth. A launched ball is travelling
  // the way the gate points and passes straight through; a ball already in play
  // cannot climb back in and end up parked on the plunger.
  walls.push({
    kind: 'wall',
    a: laneExitInner,
    b: laneExitOuter,
    bounce: 0.2,
    blockNormal: {
      x: Math.sin(LANE_EXIT_ANGLE),
      y: -Math.cos(LANE_EXIT_ANGLE),
    },
  });

  return walls;
}

/** Round posts: the rubbers at the mouth of each outlane, and the lane tips. */
function posts(): Post[] {
  // Narrowing the outlane mouth is the difference between a lively table and
  // one that eats a ball every twenty seconds - but the channel it leaves has
  // to stay wider than a ball, or the outlane simply plugs and the post turns
  // into a shelf that a ball can park on.
  return [
    { kind: 'post', center: OUTLANE_POST, radius: OUTLANE_POST_RADIUS, bounce: 0.5 },
    { kind: 'post', center: mirrorX(OUTLANE_POST), radius: OUTLANE_POST_RADIUS, bounce: 0.5 },
    ...BUMPERS.map(
      (bumper): Post => ({
        kind: 'post',
        center: bumper.center,
        radius: bumper.radius,
        bounce: 0.35,
        id: bumper.id,
        kick: 5.6,
      }),
    ),
  ];
}

/** Everything the ball can pass through rather than bounce off. */
function triggers(): Trigger[] {
  return [
    ...TOP_LANES.map((lane): Trigger => ({ kind: 'trigger', id: lane.id, center: lane.center, radius: 15 })),
    { kind: 'trigger', id: 'doghouse', center: DOGHOUSE, radius: DOGHOUSE_RADIUS },
    // The orbit lanes, sampled top and bottom so a full lap can be told apart
    // from a ball that merely wandered into the lane and fell back out.
    { kind: 'trigger', id: 'orbit-left-top', center: { x: 40, y: 190 }, radius: 17 },
    { kind: 'trigger', id: 'orbit-left-bottom', center: { x: 48, y: 400 }, radius: 17 },
    { kind: 'trigger', id: 'orbit-right-top', center: { x: 306, y: 200 }, radius: 17 },
    { kind: 'trigger', id: 'orbit-right-bottom', center: { x: 292, y: 400 }, radius: 17 },
    // The spinner sits in the left lane, where a hard left-flipper shot rips it.
    { kind: 'trigger', id: 'spinner', center: { x: 42, y: 300 }, radius: 15 },
    // The inlanes, which is where the "ball saved" and combo timers are armed.
    { kind: 'trigger', id: 'inlane-left', center: { x: 86, y: 510 }, radius: 12 },
    { kind: 'trigger', id: 'inlane-right', center: mirrorX({ x: 86, y: 510 }), radius: 12 },
    { kind: 'trigger', id: 'outlane-left', center: { x: 66, y: 522 }, radius: 12 },
    { kind: 'trigger', id: 'outlane-right', center: mirrorX({ x: 66, y: 522 }), radius: 12 },
  ];
}

function target(spec: DropTarget, bounce: number): Wall {
  return { kind: 'wall', a: spec.a, b: spec.b, bounce, id: spec.id };
}

/** The parts of the table that never change, built once at startup. */
export function staticColliders(): (Wall | Post)[] {
  return [...shell(), ...slingshot('left'), ...slingshot('right'), ...posts(), target(SQUIRREL, 0.55)];
}

export function tableTriggers(): Trigger[] {
  return triggers();
}

/** The drop targets that are still standing, given a bitmask of downed ones. */
export function standingDropTargets(down: readonly boolean[]): Wall[] {
  return DROP_TARGETS.filter((_, index) => !down[index]).map((spec) => target(spec, 0.4));
}
