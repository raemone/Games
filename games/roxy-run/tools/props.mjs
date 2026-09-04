// Collectibles, hazards and enemies. Enemies are drawn once per world so the
// same behaviour can wear a squirrel, a snowball or a crab.
import { Grid } from './draw.mjs';

function finish(grid) {
  grid.outline('o');
  return grid;
}

/** The bone Roxy collects - this game's ring. */
export function bone() {
  const g = new Grid(16, 16);
  g.capsule(4, 8, 12, 8, 2, 'C');
  for (const [x, y] of [
    [4, 6],
    [4, 10],
    [12, 6],
    [12, 10],
  ]) {
    g.ellipse(x, y, 2.4, 2.4, 'C');
  }
  g.ellipse(6, 6, 1.2, 1, 'W'); // highlight
  return finish(g);
}

/** A springy pad. `sprung` is the squashed-and-released frame. */
export function spring(sprung) {
  const g = new Grid(16, 16);
  const topY = sprung ? 4 : 9;
  g.rect(2, 13, 12, 3, 'D');
  // Coil.
  for (let y = topY + 3; y < 13; y += 2) g.rect(4, y, 8, 1, 'Y');
  g.rect(1, topY, 14, 3, 'R');
  g.rect(2, topY, 12, 1, 'T');
  return finish(g);
}

export function spike() {
  const g = new Grid(16, 16);
  g.rect(0, 13, 16, 3, 'S');
  // Two triangles, tallest in the middle of each.
  for (let i = 0; i < 6; i++) {
    const h = 7 - Math.abs(i - 2.5) * 2.4;
    g.rect(2 + i, 13 - h, 1, h, 'S');
    g.rect(9 + i, 13 - h, 1, h, 'S');
    g.set(2 + i, 13 - h, 'W'); // glinting tip
    g.set(9 + i, 13 - h, 'W');
  }
  return finish(g);
}

export function crate() {
  const g = new Grid(16, 16);
  g.rect(0, 0, 16, 16, 'D');
  g.rect(2, 2, 12, 12, 'M');
  g.rect(0, 7, 16, 2, 'D');
  g.rect(7, 0, 2, 16, 'D');
  return finish(g);
}

/** Roxy's checkpoint: a dog bowl on a post. `lit` is the reached state. */
export function checkpoint(lit) {
  const g = new Grid(16, 32);
  g.rect(6, 10, 4, 22, 'S');
  g.ellipse(8, 9, 7, 4, lit ? 'R' : 'W');
  g.ellipse(8, 8, 5.5, 3, lit ? 'T' : 'S');
  if (lit) {
    g.ellipse(8, 5, 2, 2, 'Y'); // a treat appears once it is hit
    g.ellipse(4, 4, 1, 1, 'Y');
    g.ellipse(12, 4, 1, 1, 'Y');
  }
  return finish(g);
}

/** The goal: a kennel with a flag on top. */
export function goal() {
  const g = new Grid(32, 48);
  g.rect(3, 20, 26, 28, 'D'); // kennel body
  g.rect(5, 22, 22, 24, 'M');
  // Roof.
  for (let i = 0; i < 15; i++) {
    g.rect(1 + i, 20 - i, 30 - i * 2, 1, 'R');
  }
  g.ellipse(16, 38, 7, 10, 'o'); // doorway
  g.ellipse(16, 39, 5.5, 9, 'E');
  g.rect(24, 0, 2, 12, 'S'); // flagpole
  g.rect(14, 1, 11, 7, 'Y'); // flag
  g.ellipse(19, 4.5, 2.5, 2.5, 'R');
  return finish(g);
}

/** Ground enemy. The palette key for its body is passed in per world. */
export function walker(bodyKey, step) {
  const g = new Grid(24, 24);
  const bob = step ? -1 : 0;
  g.ellipse(12, 15 + bob, 7, 6, bodyKey);
  g.ellipse(16, 11 + bob, 4.5, 4.5, bodyKey); // head
  g.ellipse(6, 11 + bob, 4, 5, bodyKey); // tail or shell tip
  g.ellipse(18, 10 + bob, 1.3, 1.4, 'E');
  g.set(17.5, 9.5 + bob, 'W');
  // Feet, which alternate with the step.
  g.ellipse(step ? 8 : 10, 21, 2.4, 2, 'o');
  g.ellipse(step ? 16 : 14, 21, 2.4, 2, 'o');
  return finish(g);
}

/** Flying enemy, wings up or down. */
export function flyer(bodyKey, up) {
  const g = new Grid(24, 24);
  // Wings go down first so the body sits in front of them, otherwise they
  // swamp the sprite and it stops reading as a creature.
  const wingY = up ? 7 : 11;
  g.ellipse(9, wingY, 4, 2.2, 'W');
  g.ellipse(14, wingY - 1, 3.2, 1.9, 'W');

  g.ellipse(12, 15, 6, 4.6, bodyKey);
  g.ellipse(17, 13, 3.4, 3.4, bodyKey);
  g.ellipse(19, 12.5, 1.2, 1.3, 'E');
  g.set(18.5, 12, 'W');
  g.rect(9, 14, 6, 1, 'o'); // stripes
  g.rect(9, 16, 6, 1, 'o');
  return finish(g);
}
