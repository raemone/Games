// Roxy herself: a side-on golden retriever, composed from shapes so every
// animation frame is a handful of parameters rather than 1024 hand-set pixels.
import { Grid } from './draw.mjs';

export const CELL = 32;
/** Where the feet sit inside the cell. */
const GROUND_Y = 30;

/** Draw one leg as a capsule from hip to foot, swung by `phase`. */
function leg(grid, hipX, hipY, phase, reach, lift, colour) {
  const footX = hipX + Math.sin(phase) * reach;
  const footY = GROUND_Y - Math.max(0, Math.cos(phase)) * lift;
  // A knee part-way along, bent forward, so the leg does not read as a stick.
  const kneeX = hipX + Math.sin(phase) * reach * 0.4;
  const kneeY = (hipY + footY) / 2;
  grid.capsule(hipX, hipY, kneeX, kneeY, 2, colour);
  grid.capsule(kneeX, kneeY, footX, footY, 1.6, colour);
  // Paw.
  grid.ellipse(footX + 0.5, footY, 2.2, 1.4, 'C');
}

function tail(grid, wag) {
  // A retriever's tail is a plume, not a stick - it arcs up and fans out, and
  // it is most of what makes the silhouette read as this breed.
  const midX = 4.5 + Math.sin(wag) * 0.8;
  const tipX = 3 + Math.sin(wag) * 2.2;
  const tipY = 9 + Math.cos(wag) * 1.2;
  grid.capsule(7, 19, midX, 14, 2.4, 'M');
  grid.capsule(midX, 14, tipX, tipY + 1.5, 2.8, 'L');
  grid.ellipse(tipX, tipY, 3, 3.4, 'L');
}

function head(grid, dy, blink, earSwing) {
  // Skull, then a long retriever muzzle, then the big hanging ear over the top.
  grid.ellipse(23, 11 + dy, 5.4, 5.2, 'M');
  grid.ellipse(28, 14 + dy, 4.4, 2.8, 'C');
  grid.capsule(21, 7.5 + dy, 20 + earSwing, 18 + dy, 3.2, 'D');

  grid.ellipse(30.5, 13 + dy, 1.5, 1.3, 'N'); // nose
  if (blink) {
    grid.rect(24, 10 + dy, 4, 1, 'o');
  } else {
    grid.ellipse(25.5, 9.5 + dy, 1.7, 1.8, 'E');
    grid.set(25, 9 + dy, 'W');
  }
  // Mouth line, which is what makes her look pleased rather than blank.
  grid.set(30, 16 + dy, 'o');
  grid.set(29, 16 + dy, 'o');
  grid.set(28, 15.5 + dy, 'o');
}

function body(grid, dy) {
  grid.ellipse(14, 20 + dy, 9.5, 6.5, 'M');
  grid.ellipse(19, 19 + dy, 5, 5.5, 'M'); // chest
  grid.ellipse(13, 23 + dy, 7, 3.5, 'C'); // pale belly
}

/** The collar goes on last, or the head draws straight over it. */
function collar(grid, dy) {
  grid.rect(19, 16 + dy, 3, 4, 'R');
  grid.set(20, 20 + dy, 'Y'); // tag
}

function finish(grid) {
  grid.shadeBelow('M', 'D', 1);
  grid.outline('o');
  return grid;
}

/** A standing or running pose. */
function pose({ frontPhase, backPhase, bodyDy = 0, reach = 5, lift = 4, blink = false, wag = 0, earSwing = 0 }) {
  const grid = new Grid(CELL, CELL);
  // Far-side legs first, in the shade, so the near legs read as in front.
  leg(grid, 10, 22 + bodyDy, backPhase + Math.PI, reach, lift, 'D');
  leg(grid, 19, 22 + bodyDy, frontPhase + Math.PI, reach, lift, 'D');
  tail(grid, wag);
  body(grid, bodyDy);
  head(grid, bodyDy, blink, earSwing);
  collar(grid, bodyDy);
  leg(grid, 11, 23 + bodyDy, backPhase, reach, lift, 'M');
  leg(grid, 20, 23 + bodyDy, frontPhase, reach, lift, 'M');
  return finish(grid);
}

/** Curled into a spinning ball. `turn` is 0..1 around the circle. */
function rollFrame(turn) {
  const grid = new Grid(CELL, CELL);
  const cx = 16;
  const cy = 21;
  grid.ellipse(cx, cy, 9.5, 9.5, 'M');
  grid.ellipse(cx, cy, 6, 6, 'L');

  // Three arcs of fur that sweep round, which is what sells the rotation.
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
  // An ear and a paw poking out, so it is still recognisably a dog.
  const ea = turn * Math.PI * 2;
  grid.ellipse(cx + Math.cos(ea) * 8, cy + Math.sin(ea) * 8, 2.4, 2, 'D');
  grid.ellipse(cx - Math.cos(ea) * 8, cy - Math.sin(ea) * 8, 2, 1.8, 'C');
  return finish(grid);
}

function jumpFrame() {
  const grid = new Grid(CELL, CELL);
  // Legs tucked up and forward.
  grid.capsule(11, 22, 9, 25, 2, 'D');
  grid.capsule(19, 22, 22, 25, 2, 'D');
  tail(grid, 1.2);
  body(grid, -1);
  head(grid, -1, false, 1.5);
  collar(grid, -1);
  grid.capsule(12, 23, 10, 26, 2, 'M');
  grid.capsule(20, 23, 23, 26, 2, 'M');
  grid.ellipse(9.5, 26, 2.2, 1.4, 'C');
  grid.ellipse(23.5, 26, 2.2, 1.4, 'C');
  return finish(grid);
}

function hurtFrame() {
  const grid = new Grid(CELL, CELL);
  leg(grid, 10, 22, 2.2, 6, 5, 'D');
  leg(grid, 19, 22, -2.2, 6, 5, 'D');
  tail(grid, 2.5);
  body(grid, 0);

  grid.ellipse(23, 11, 5.4, 5.2, 'M');
  grid.ellipse(28, 14, 4.4, 2.8, 'C');
  grid.capsule(21, 7, 19, 16, 3.2, 'D');
  collar(grid, 0);
  grid.ellipse(30.5, 13, 1.5, 1.3, 'N');
  // Screwed-shut eye.
  grid.set(24, 10, 'o');
  grid.set(26, 10, 'o');
  grid.set(25, 11, 'o');
  grid.set(24, 12, 'o');
  grid.set(26, 12, 'o');

  leg(grid, 11, 23, 2.2, 6, 5, 'M');
  leg(grid, 20, 23, -2.2, 6, 5, 'M');
  return finish(grid);
}

function skidFrame() {
  const grid = new Grid(CELL, CELL);
  // Front legs braced forward, haunches down.
  leg(grid, 10, 24, -0.6, 3, 0, 'D');
  leg(grid, 19, 22, 1.3, 7, 0, 'D');
  tail(grid, 2.8);
  body(grid, 2);
  head(grid, 1, false, -1.5);
  collar(grid, 1);
  leg(grid, 11, 25, -0.6, 3, 0, 'M');
  leg(grid, 20, 23, 1.3, 7, 0, 'M');
  return finish(grid);
}

function victoryFrame(up) {
  const grid = new Grid(CELL, CELL);
  const dy = up ? -2 : 0;
  leg(grid, 10, 22 + dy, 0.2, 3, 0, 'D');
  leg(grid, 19, 20 + dy, up ? -1.6 : -1.1, 6, 6, 'D');
  tail(grid, up ? 0.4 : 2.6);
  body(grid, dy);
  head(grid, dy - (up ? 1 : 0), false, up ? -2 : 0);
  collar(grid, dy);
  // Tongue out - she is very pleased with herself.
  grid.ellipse(30, 17 + dy, 1.2, 1.8, 'T');
  leg(grid, 11, 23 + dy, 0.2, 3, 0, 'M');
  leg(grid, 20, 21 + dy, up ? -1.6 : -1.1, 6, 6, 'M');
  return finish(grid);
}

/**
 * Every animation, as named strips of frames. The play scene picks a strip by
 * state and a frame by a timer, so adding a pose here is all it takes.
 */
export function roxyAnimations() {
  const idle = [];
  for (let i = 0; i < 4; i++) {
    idle.push(
      pose({
        frontPhase: 0,
        backPhase: 0,
        reach: 2,
        lift: 0,
        bodyDy: i === 1 || i === 3 ? -1 : 0,
        blink: i === 2,
        wag: Math.sin((i / 4) * Math.PI * 2) * 1.4,
        earSwing: Math.sin((i / 4) * Math.PI * 2) * 0.6,
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
        wag: Math.sin(phase) * 1.2,
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
        wag: Math.sin(phase * 2) * 1.6,
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
