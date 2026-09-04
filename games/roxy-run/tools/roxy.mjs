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
 * The tail: carried straight out and level with the back, with a light fringe
 * hanging beneath it - the retriever part of an otherwise plain silhouette.
 */
function tail(grid, wag) {
  const lift = Math.sin(wag) * 1.2;
  grid.capsule(10, 14.8, 3, 13 - lift, 2.5, 'M');
  grid.ellipse(2.8, 13 - lift, 1.9, 1.8, 'L');
  grid.capsule(9, 16.4, 3.6, 14.8 - lift * 0.8, 1.8, 'C');
}

function head(grid, dy, blink, earSwing) {
  // Order matters here: skull, then the ear hanging over the back of it, then
  // the muzzle in front of the ear. Draw the ear last and it swallows the
  // snout, which is what turned her into a floppy-eared blob.
  grid.ellipse(23.5, 8.5 + dy, 4.2, 4.2, 'M');
  grid.ellipse(23.4, 6.2 + dy, 2.8, 1.3, 'L'); // lit top of the skull

  grid.capsule(21.6, 6.4 + dy, 21 + earSwing, 11.6 + dy, 2.2, 'D');
  grid.ellipse(21 + earSwing, 12.2 + dy, 2.1, 1.9, 'D');

  // A long straight muzzle, in gold, with the nose at the tip.
  grid.capsule(26, 10.6 + dy, 29.2, 10.8 + dy, 2.1, 'M');
  grid.ellipse(29.8, 10.6 + dy, 1.5, 1.4, 'N');

  if (blink) {
    grid.rect(24.4, 7.6 + dy, 3, 1, 'B');
  } else {
    grid.ellipse(25.3, 7.8 + dy, 1.1, 1.2, 'E');
    grid.set(24.9, 7.3 + dy, 'W');
  }
  grid.set(28.4, 12.6 + dy, 'B'); // mouth line
}

function body(grid, dy) {
  // A solid, deep-chested dog. The old build was thin enough to read as ribs.
  grid.ellipse(14, 17.5 + dy, 10, 6.4, 'M');
  grid.ellipse(20, 17 + dy, 5.6, 6, 'M'); // chest
  grid.ellipse(8.5, 17 + dy, 6, 6, 'M'); // haunch
  grid.capsule(20.8, 15 + dy, 23, 11 + dy, 3.2, 'M'); // neck

  // A narrow sunlit rim along the spine only. As a broad band it washed the
  // whole dog out to one pale colour, and she stopped reading as golden.
  grid.ellipse(14, 12.4 + dy, 7.6, 1.3, 'L');

  // Feathering: a thin fringe under the belly and a small chest ruff.
  grid.ellipse(14, BELLY_Y + dy, 7.4, 1.4, 'C');
  grid.ellipse(20.4, 20.4 + dy, 3, 1.9, 'C');
}

function finish(grid) {
  grid.outline('B');
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
  leg(grid, 10.5, BELLY_Y, 2.4, 6, 0, 'M', true);
  leg(grid, 20.5, BELLY_Y, -1.9, 6, 0, 'M', true);
  return finish(grid);
}

function hurtFrame() {
  const grid = new Grid(CELL, CELL);
  leg(grid, 8.5, BELLY_Y, 2.2, 6, 5, 'D', false);
  leg(grid, 19.5, BELLY_Y, -2.2, 6, 5, 'D', false);
  tail(grid, 2.6);
  body(grid, 0);
  head(grid, 0, true, -1.2); // eye screwed shut
  leg(grid, 9.5, BELLY_Y + 1, 2.2, 6, 5, 'M', true);
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
