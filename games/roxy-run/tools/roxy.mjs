// Roxy herself: a side-on golden retriever, composed from shapes so every
// animation frame is a handful of parameters rather than 1024 hand-set pixels.
//
// The proportions follow the breed rather than a generic cartoon dog: a long
// level back, legs that are genuinely long, a straight muzzle about as long as
// the skull, ears set high and hanging, and - the thing that most makes the
// silhouette read as a retriever - heavy cream feathering on the tail, chest,
// belly and the backs of the legs.
import { Grid } from './draw.mjs';

export const CELL = 32;
/** Where the paws sit inside the cell. */
const GROUND_Y = 30;
/** Underside of the ribcage. Legs hang from here. */
const BELLY_Y = 20;

/**
 * One leg: upper, lower, paw, and the feathering on the back of it.
 * `phase` swings it; `back` legs are drawn slightly heavier at the top.
 */
function leg(grid, hipX, hipY, phase, reach, lift, colour, feather) {
  const footX = hipX + Math.sin(phase) * reach;
  const footY = GROUND_Y - Math.max(0, Math.cos(phase)) * lift;
  const kneeX = hipX + Math.sin(phase) * reach * 0.35;
  const kneeY = (hipY + footY) / 2 + 1;

  // Feathering trails behind the upper leg, so it shows when the leg swings.
  if (feather) {
    // A trailing fringe, not a whole cream leg - she has to stay golden.
    grid.capsule(hipX - 1.4, hipY + 1, kneeX - 1.8, kneeY, 1.6, 'C');
  }
  grid.capsule(hipX, hipY, kneeX, kneeY, 2.1, colour);
  grid.capsule(kneeX, kneeY, footX, footY - 1, 1.5, colour);
  grid.ellipse(footX + 0.5, footY, 2.3, 1.5, 'C');
}

/**
 * The plumed tail. Carried up and back in an arc rather than level, because a
 * level tail disappears behind the body at this size and the plume is the most
 * recognisable part of the breed's silhouette.
 */
function tail(grid, wag) {
  const lift = Math.sin(wag) * 1.2;
  // Swept back and only a little up. Any higher and it reads as a flagpole
  // rather than a tail, and it clips the top of the cell.
  grid.capsule(8.5, 15.5, 5, 13 - lift * 0.5, 2.2, 'M');
  grid.capsule(5, 13 - lift * 0.5, 2.4, 10.5 - lift, 2.4, 'L');
  grid.ellipse(2.4, 10.5 - lift, 2.6, 2.4, 'L');
  // The long fringe hanging beneath it.
  grid.capsule(7.5, 17, 4, 15 - lift * 0.4, 2.2, 'C');
  grid.capsule(4, 15 - lift * 0.4, 2.2, 13 - lift, 2, 'C');
}

function head(grid, dy, blink, earSwing) {
  // Skull, then a long straight muzzle - about as long again as the skull is
  // wide, which is what stops a dog reading as a cat. The muzzle is gold on
  // top with only the jaw in cream, so the head stays golden overall.
  grid.ellipse(24.5, 8.5 + dy, 4.6, 4.5, 'M');
  grid.capsule(26, 10.5 + dy, 30.5, 11 + dy, 2.4, 'M');
  grid.capsule(27, 12.5 + dy, 30.5, 12.5 + dy, 1.3, 'C');

  // Ear: set high, hanging, wide at the bottom.
  grid.capsule(22.5, 5.5 + dy, 21.5 + earSwing, 12 + dy, 2.7, 'D');
  grid.ellipse(21.5 + earSwing, 13 + dy, 2.5, 2.2, 'D');

  grid.ellipse(31.5, 10.5 + dy, 1.5, 1.4, 'N'); // nose
  if (blink) {
    grid.rect(25, 7 + dy, 3, 1, 'o');
  } else {
    grid.ellipse(26, 7 + dy, 1.5, 1.6, 'E');
    grid.set(25.5, 6.5 + dy, 'W');
  }
  grid.set(30, 13.5 + dy, 'o'); // mouth line
  grid.set(29, 13 + dy, 'o');
}

function body(grid, dy) {
  // Long level back, deep chest, tucked waist.
  grid.ellipse(15, 16.5 + dy, 10, 4.6, 'M');
  grid.ellipse(20, 16.5 + dy, 5.2, 5, 'M'); // chest
  grid.ellipse(9.5, 16.5 + dy, 5.4, 4.4, 'M'); // haunch
  grid.capsule(21.5, 14 + dy, 23.5, 10 + dy, 3, 'M'); // neck

  // Cream feathering: a fringe along the underside rather than a slab of pale
  // belly, or she stops reading as golden at all.
  grid.ellipse(15, BELLY_Y - 1.5 + dy, 8, 1.7, 'C');
  grid.ellipse(20.5, 19 + dy, 3, 2.2, 'C');
  grid.ellipse(23, 14 + dy, 1.8, 2, 'C'); // throat ruff
}

/** The collar goes on last, or the head and ruff draw straight over it. */
function collar(grid, dy) {
  grid.capsule(22, 12 + dy, 23.3, 15 + dy, 1.3, 'R');
  grid.set(23, 15.5 + dy, 'Y'); // tag
}

function finish(grid) {
  grid.shadeBelow('M', 'D', 1);
  grid.outline('o');
  return grid;
}

/** A standing or running pose. */
function pose({
  frontPhase,
  backPhase,
  bodyDy = 0,
  reach = 5,
  lift = 4,
  blink = false,
  wag = 0,
  earSwing = 0,
}) {
  const grid = new Grid(CELL, CELL);
  // Far-side legs first, in shade, so the near pair reads as in front.
  leg(grid, 9.5, BELLY_Y + bodyDy, backPhase + Math.PI, reach, lift, 'D', false);
  leg(grid, 19.5, BELLY_Y + bodyDy, frontPhase + Math.PI, reach, lift, 'D', false);
  tail(grid, wag);
  body(grid, bodyDy);
  head(grid, bodyDy, blink, earSwing);
  collar(grid, bodyDy);
  leg(grid, 10.5, BELLY_Y + 1 + bodyDy, backPhase, reach, lift, 'M', true);
  leg(grid, 20.5, BELLY_Y + 1 + bodyDy, frontPhase, reach, lift, 'M', true);
  return finish(grid);
}

/** Curled into a spinning ball. `turn` is 0..1 around the circle. */
function rollFrame(turn) {
  const grid = new Grid(CELL, CELL);
  const cx = 16;
  const cy = 20;
  grid.ellipse(cx, cy, 9.5, 9.5, 'M');
  grid.ellipse(cx, cy, 6, 6, 'L');

  // Sweeping arcs of fur, which is what sells the rotation.
  for (let i = 0; i < 3; i++) {
    const a = turn * Math.PI * 2 + (i * Math.PI * 2) / 3;
    grid.capsule(
      cx + Math.cos(a) * 3,
      cy + Math.sin(a) * 3,
      cx + Math.cos(a) * 8.5,
      cy + Math.sin(a) * 8.5,
      1.4,
      'D',
    );
  }
  // An ear and the tail plume poking out, so it stays a dog and not a wheel.
  const ea = turn * Math.PI * 2;
  grid.ellipse(cx + Math.cos(ea) * 8, cy + Math.sin(ea) * 8, 2.6, 2.2, 'D');
  grid.ellipse(cx - Math.cos(ea) * 8.5, cy - Math.sin(ea) * 8.5, 2.8, 2.4, 'C');
  return finish(grid);
}

function jumpFrame() {
  const grid = new Grid(CELL, CELL);
  // Front legs reaching, back legs trailing - a dog at full stretch.
  leg(grid, 9.5, BELLY_Y - 1, 2.4, 6, 0, 'D', false);
  leg(grid, 19.5, BELLY_Y - 1, -1.9, 6, 0, 'D', false);
  tail(grid, 0.6);
  body(grid, -1);
  head(grid, -1.5, false, 1.6);
  collar(grid, -1.5);
  leg(grid, 10.5, BELLY_Y, 2.4, 6, 0, 'M', true);
  leg(grid, 20.5, BELLY_Y, -1.9, 6, 0, 'M', true);
  return finish(grid);
}

function hurtFrame() {
  const grid = new Grid(CELL, CELL);
  leg(grid, 9.5, BELLY_Y, 2.2, 6, 5, 'D', false);
  leg(grid, 19.5, BELLY_Y, -2.2, 6, 5, 'D', false);
  tail(grid, 2.6);
  body(grid, 0);

  grid.ellipse(24.5, 8.5, 4.6, 4.5, 'M');
  grid.capsule(26, 10.5, 30.5, 11, 2.4, 'M');
  grid.capsule(27, 12.5, 30.5, 12.5, 1.3, 'C');
  grid.capsule(22.5, 4.5, 21, 11, 2.7, 'D');
  grid.ellipse(31.5, 10.5, 1.5, 1.4, 'N');
  collar(grid, 0);
  // Screwed-shut eye.
  grid.set(25, 6, 'o');
  grid.set(27, 6, 'o');
  grid.set(26, 7, 'o');
  grid.set(25, 8, 'o');
  grid.set(27, 8, 'o');

  leg(grid, 10.5, BELLY_Y + 1, 2.2, 6, 5, 'M', true);
  leg(grid, 20.5, BELLY_Y + 1, -2.2, 6, 5, 'M', true);
  return finish(grid);
}

function skidFrame() {
  const grid = new Grid(CELL, CELL);
  // Front legs braced forward, haunches dropped.
  leg(grid, 9.5, BELLY_Y + 2, -0.5, 3, 0, 'D', false);
  leg(grid, 19.5, BELLY_Y, 1.4, 7, 0, 'D', false);
  tail(grid, 2.8);
  body(grid, 2);
  head(grid, 1, false, -1.6);
  collar(grid, 1);
  leg(grid, 10.5, BELLY_Y + 3, -0.5, 3, 0, 'M', true);
  leg(grid, 20.5, BELLY_Y + 1, 1.4, 7, 0, 'M', true);
  return finish(grid);
}

function victoryFrame(up) {
  const grid = new Grid(CELL, CELL);
  const dy = up ? -2 : 0;
  leg(grid, 9.5, BELLY_Y + dy, 0.2, 3, 0, 'D', false);
  leg(grid, 19.5, BELLY_Y - 2 + dy, up ? -1.7 : -1.2, 6, 6, 'D', false);
  tail(grid, up ? 0.3 : 2.6);
  body(grid, dy);
  head(grid, dy - (up ? 1 : 0), false, up ? -2 : 0);
  collar(grid, dy);
  grid.ellipse(31, 14 + dy, 1.3, 2, 'T'); // tongue out, very pleased
  leg(grid, 10.5, BELLY_Y + 1 + dy, 0.2, 3, 0, 'M', true);
  leg(grid, 20.5, BELLY_Y - 1 + dy, up ? -1.7 : -1.2, 6, 6, 'M', true);
  return finish(grid);
}

/**
 * Every animation, as named strips of frames. The play scene picks a strip by
 * state and a frame by a timer, so adding a pose here is all it takes.
 */
export function roxyAnimations() {
  const idle = [];
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) * Math.PI * 2;
    idle.push(
      pose({
        frontPhase: 0,
        backPhase: 0,
        reach: 1.5,
        lift: 0,
        bodyDy: i === 1 || i === 3 ? -1 : 0,
        blink: i === 2,
        wag: t,
        earSwing: Math.sin(t) * 0.6,
      }),
    );
  }

  const walk = [];
  for (let i = 0; i < 6; i++) {
    const phase = (i / 6) * Math.PI * 2;
    walk.push(
      pose({
        frontPhase: phase,
        backPhase: phase + Math.PI,
        reach: 4,
        lift: 3,
        bodyDy: Math.abs(Math.sin(phase)) > 0.8 ? -1 : 0,
        wag: phase,
      }),
    );
  }

  const run = [];
  for (let i = 0; i < 8; i++) {
    const phase = (i / 8) * Math.PI * 2;
    run.push(
      pose({
        // Front and back pairs slightly out of step reads as a gallop.
        frontPhase: phase + Math.PI * 0.6,
        backPhase: phase,
        reach: 7,
        lift: 6,
        bodyDy: -Math.abs(Math.sin(phase * 2)) * 2,
        wag: phase * 2,
        earSwing: 1.4,
      }),
    );
  }

  const roll = [];
  for (let i = 0; i < 4; i++) roll.push(rollFrame(i / 4));

  return {
    idle,
    walk,
    run,
    roll,
    jump: [jumpFrame()],
    hurt: [hurtFrame()],
    skid: [skidFrame()],
    victory: [victoryFrame(false), victoryFrame(true)],
  };
}
