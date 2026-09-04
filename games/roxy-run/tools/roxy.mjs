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
 * One leg. Retrievers are solid dogs, so these are deliberately chunky - thin
 * legs plus a pale belly made her read as gaunt rather than as a puppy.
 */
function leg(grid, hipX, hipY, phase, reach, lift, colour, feather) {
  const footX = hipX + Math.sin(phase) * reach;
  const footY = GROUND_Y - Math.max(0, Math.cos(phase)) * lift;
  const kneeX = hipX + Math.sin(phase) * reach * 0.35;
  const kneeY = (hipY + footY) / 2 + 1;

  if (feather) {
    grid.capsule(hipX - 1.6, hipY + 1, kneeX - 1.8, kneeY, 2, 'C');
  }
  grid.capsule(hipX, hipY, kneeX, kneeY, 2.7, colour);
  grid.capsule(kneeX, kneeY, footX, footY - 1, 2.1, colour);
  grid.ellipse(footX + 0.3, footY, 2.5, 1.6, 'C');
  grid.ellipse(footX + 0.5, footY + 0.5, 1.5, 0.9, 'c');
}

/**
 * The plumed tail. Carried swept back and a little up: level, it disappears
 * behind the body at this size, and the plume is the most recognisable part of
 * the breed's silhouette.
 */
function tail(grid, wag) {
  const lift = Math.sin(wag) * 1.2;
  grid.capsule(9, 15, 5, 12.5 - lift * 0.5, 2.8, 'M');
  grid.capsule(5, 12.5 - lift * 0.5, 2.4, 10 - lift, 2.7, 'M');
  grid.ellipse(2.6, 10 - lift, 2.8, 2.6, 'L');
  // The long fringe hanging beneath it.
  grid.capsule(8, 17.5, 4.2, 15 - lift * 0.4, 2.2, 'C');
  grid.capsule(4.2, 15 - lift * 0.4, 2.6, 12.8 - lift, 2, 'C');
}

function head(grid, dy, blink, earSwing) {
  // A broad round skull and a short blunt muzzle. The muzzle is gold with only
  // a small cream chin - as a pale slab it looked like an exposed jaw.
  grid.ellipse(24.4, 9 + dy, 4.5, 4.5, 'M');
  grid.ellipse(24.2, 6.6 + dy, 3, 1.4, 'L'); // lit top of the skull
  // A long straight muzzle, in gold. Short and blunt it read as a bear cub;
  // pale, it read as an exposed jaw.
  grid.capsule(26.2, 11.4 + dy, 29.2, 11.6 + dy, 2.4, 'M');

  // Ear: set high, hanging, and thick with fur.
  grid.capsule(23, 6 + dy, 22 + earSwing, 13 + dy, 3, 'D');
  grid.ellipse(22 + earSwing, 14 + dy, 2.8, 2.4, 'D');

  grid.ellipse(30, 11.3 + dy, 1.7, 1.6, 'N'); // nose
  if (blink) {
    grid.rect(25, 8 + dy, 3, 1, 'o');
  } else {
    grid.ellipse(25.9, 8.2 + dy, 1.2, 1.3, 'E');
    grid.set(25.5, 7.6 + dy, 'W');
  }
  grid.set(28.6, 13.6 + dy, 'o'); // mouth line
}

function body(grid, dy) {
  // A solid, deep-chested dog. The old build was thin enough to read as ribs.
  grid.ellipse(14, 17.5 + dy, 10, 6.4, 'M');
  grid.ellipse(20, 17 + dy, 5.6, 6, 'M'); // chest
  grid.ellipse(8.5, 17 + dy, 6, 6, 'M'); // haunch
  grid.capsule(21, 14 + dy, 24, 10.5 + dy, 3.6, 'M'); // neck

  // A narrow sunlit rim along the spine only. As a broad band it washed the
  // whole dog out to one pale colour, and she stopped reading as golden.
  grid.ellipse(14, 12.4 + dy, 7.6, 1.3, 'L');

  // Feathering: a thin fringe under the belly and a small chest ruff.
  grid.ellipse(14, BELLY_Y + dy, 7.4, 1.4, 'C');
  grid.ellipse(20.4, 20.4 + dy, 3, 1.9, 'C');
  // Shade under the jaw so the head reads separately from the shoulders.
  grid.ellipse(21.5, 15.5 + dy, 2.6, 1.6, 'D');
}

/** The collar goes on last, or the head and ruff draw straight over it. */
function collar(grid, dy) {
  // A slim band at the base of the neck. Thick and high it sat over her face
  // and read as a lolling tongue.
  grid.capsule(18.8, 16.2 + dy, 21.6, 13.4 + dy, 1.3, 'R');
  grid.capsule(19.2, 16.8 + dy, 22, 14 + dy, 0.6, 'r');
  grid.ellipse(19.8, 17.2 + dy, 1, 1, 'Y'); // tag
}

function finish(grid) {
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
  leg(grid, 8.5, BELLY_Y + bodyDy, backPhase + Math.PI, reach, lift, 'D', false);
  leg(grid, 19.5, BELLY_Y + bodyDy, frontPhase + Math.PI, reach, lift, 'D', false);
  tail(grid, wag);
  body(grid, bodyDy);
  head(grid, bodyDy, blink, earSwing);
  collar(grid, bodyDy);
  leg(grid, 9.5, BELLY_Y + 1 + bodyDy, backPhase, reach, lift, 'M', true);
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

  grid.ellipse(24.4, 9, 4.5, 4.5, 'M');
  grid.ellipse(24.2, 6.6, 3, 1.4, 'L');
  grid.capsule(26.2, 11.4, 29.2, 11.6, 2.4, 'M');
  grid.capsule(23, 5, 21.6, 12, 3, 'D');
  grid.ellipse(30, 11.3, 1.7, 1.6, 'N');
  collar(grid, 0);
  // Screwed-shut eye.
  grid.set(25.5, 7, 'o');
  grid.set(27.5, 7, 'o');
  grid.set(26.5, 8, 'o');
  grid.set(25.5, 9, 'o');
  grid.set(27.5, 9, 'o');

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
