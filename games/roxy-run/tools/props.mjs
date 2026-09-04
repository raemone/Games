// Collectibles, hazards and enemies. Enemies are drawn once per world so the
// same behaviour can wear a squirrel, a snowball or a crab.
import { Grid } from './draw.mjs';

function finish(grid) {
  grid.outline('o');
  return grid;
}

/**
 * The bone Roxy collects - this game's ring.
 *
 * Hand-authored rather than composed from ellipses: at 16px a bone lives or
 * dies on the waist between its four knobs, and shapes fat enough to read as
 * knobs always merged into one blob. Three tones, lit from the top left, so it
 * pops against grass, snow and sand alike.
 */
const BONE_ROWS = [
  '.WWWWW....WWWWW.',
  'WWWWWW....WWWWWW',
  'cccccc....cccccc',
  'cccccc....cccccc',
  'cccccccccccccccc',
  'cccccccccccccccc',
  'cccccccccccccccc',
  'cccccc....cccccc',
  'cccccc....cccccc',
  'CCCCCC....CCCCCC',
  '.CCCCC....CCCCC.',
];

export function bone() {
  // Wider than a tile, with a straight three-row shaft between the knobs. A
  // pinched waist reads as a bowtie; the flat middle is what says "bone".
  const g = new Grid(18, 16);
  g.stamp(BONE_ROWS, 1, 2);
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

/**
 * The ground enemy: a white duck, waddling. `step` alternates the feet.
 * Every world gets the same bird - ducks are ducks.
 */
export function walker(step) {
  const g = new Grid(24, 24);
  const bob = step ? -1 : 0;

  // Feet first, so the body sits over them.
  g.ellipse(step ? 8 : 11, 21 + bob, 2.4, 1.4, 'k');
  g.ellipse(step ? 13 : 10, 21.5, 2.4, 1.4, 'K');

  g.ellipse(10.5, 15 + bob, 7, 5.4, 'q'); // body
  g.ellipse(4.5, 12.5 + bob, 3, 2.4, 'q'); // tail tuft
  g.capsule(14.5, 12 + bob, 17, 7 + bob, 2.3, 'q'); // neck
  g.ellipse(17.8, 5.8 + bob, 3.2, 3, 'q'); // head

  g.ellipse(10, 15 + bob, 4.2, 2.6, 'Q'); // folded wing
  g.capsule(20, 6 + bob, 22.8, 6.6 + bob, 1.5, 'k'); // bill
  g.ellipse(22.6, 6.6 + bob, 1.2, 1, 'K');

  g.ellipse(18.6, 4.8 + bob, 1.1, 1.2, 'E');
  g.set(18.2, 4.3 + bob, 'W');
  return finish(g);
}

/** The flying enemy: the same duck, airborne, wings up or down. */
export function flyer(up) {
  const g = new Grid(24, 24);
  const wingY = up ? 5.5 : 17.5;

  // Far wing behind the body, near wing in front, so it reads as flapping.
  g.ellipse(9.5, wingY + (up ? 1.5 : -1.5), 5, 2.4, 'Q');

  g.ellipse(10.5, 13, 6.2, 4.2, 'q'); // body
  g.ellipse(4.5, 12, 2.8, 2, 'q'); // tail
  g.capsule(14.5, 12, 18.5, 9.5, 2.1, 'q'); // outstretched neck
  g.ellipse(19.2, 9, 2.7, 2.6, 'q'); // head

  g.ellipse(9.5, wingY, 5.2, 2.5, 'q'); // near wing
  g.ellipse(9.5, wingY, 3.4, 1.4, 'Q');

  g.capsule(21.2, 9.4, 23.4, 9.8, 1.4, 'k'); // bill
  g.ellipse(20.2, 8.2, 1.1, 1.2, 'E');
  g.set(19.8, 7.8, 'W');
  g.ellipse(6, 15.5, 1.8, 1.2, 'k'); // tucked feet
  return finish(g);
}
