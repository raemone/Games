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
 * Hand-authored including its own outline. Built from circles the notch at each
 * outer edge kept coming out a single pixel deep, which the outline pass then
 * filled in, and the bone turned back into a blob. Written out by hand the
 * notch is exactly as deep as it needs to be.
 *
 * A long thin shaft with a grey line under its top edge, four knobs, and a
 * near-black outline so it stays legible on grass, snow and sand alike.
 */
const BONE_ROWS = [
  '..nnn..........nnn..',
  '.ngggn........ngggn.',
  'ngWWWgn......ngWWWgn',
  'nWWWWWnnnnnnnnWWWWWn',
  '.nWWWWggggggggWWWWn.',
  '.nWWWWWWWWWWWWWWWWn.',
  '.nWWWWWWWWWWWWWWWWn.',
  'nWWWWWnnnnnnnnWWWWWn',
  'ngWWWgn......ngWWWgn',
  '.ngggn........ngggn.',
  '..nnn..........nnn..',
];

export function bone() {
  const g = new Grid(20, 11);
  g.stamp(BONE_ROWS, 0, 0);
  return g;
}

/**
 * The star power-up. Hand-authored: a five-pointed star built from ellipses is
 * a blob, and the points are the whole point.
 */
const STAR_ROWS = [
  '      j      ',
  '     jjj     ',
  '     jjj     ',
  '    jjjjj    ',
  'jjjjjjjjjjjjj',
  ' jjjjjjjjjjj ',
  '  jjjjjjjjj  ',
  '   jjjjjjj   ',
  '   jjjjjjj   ',
  '  jjj   jjj  ',
  ' jjj     jjj ',
  'jjj       jjj',
];

export function star() {
  const g = new Grid(16, 16);
  g.stamp(STAR_ROWS, 1, 2);
  // Weight the lower half so it does not read as a flat cut-out.
  g.shadeBelow('j', 'J', 1);
  g.set(5, 6, 'W');
  g.set(6, 6, 'W');
  g.set(5, 7, 'W');
  g.outline('n');
  return g;
}

/**
 * A pigeon: plump, slate grey, with a sheen at the neck. Drawn deliberately
 * rounder and softer than the falcon so the two never read as the same bird.
 */
export function pigeon(up) {
  const g = new Grid(24, 24);
  const wingY = up ? 7 : 14;

  g.ellipse(9.5, wingY + (up ? 1.5 : -1.5), 4.6, 2.2, 'H'); // far wing

  g.ellipse(11, 13, 6, 4.6, 'h'); // body
  g.ellipse(5.5, 12.5, 3, 2.2, 'h'); // tail
  g.capsule(14.5, 12, 17.5, 9.5, 2.2, 'h'); // neck
  g.ellipse(17.6, 8.6, 2.8, 2.6, 'h'); // head
  g.ellipse(15.6, 11, 2, 1.6, 'v'); // neck sheen

  g.ellipse(9.5, wingY, 5, 2.4, 'h'); // near wing
  g.ellipse(9.5, wingY, 3.2, 1.3, 'H');

  g.capsule(19.8, 8.8, 21.4, 9.2, 1.1, 'k'); // beak
  g.ellipse(18.6, 7.8, 1, 1.1, 'E');
  g.set(18.2, 7.4, 'W');
  g.ellipse(7.5, 16.5, 1.6, 1, 'k'); // tucked feet
  return finish(g);
}

/**
 * A falcon. `stooping` folds the wings back for the dive, which is the pose
 * that has to read at a glance - it is the difference between a bird you can
 * ignore and one that is about to hit you.
 */
export function falcon(stooping) {
  const g = new Grid(24, 24);

  if (stooping) {
    // Wings swept back, body angled down along the line of the dive.
    g.capsule(6, 6, 12, 12, 2.4, 'G');
    g.ellipse(13, 13, 5.4, 4, 'f');
    g.ellipse(7.5, 7.5, 3, 2.2, 'f'); // tail, trailing up behind
    g.capsule(16.5, 15, 19, 17.5, 2, 'f');
    g.ellipse(19.4, 18, 2.6, 2.4, 'f');
    g.ellipse(12, 15, 4, 1.8, 'A'); // barred underside
    g.capsule(21.4, 18.6, 22.8, 19.2, 1.1, 'k');
    g.ellipse(20.4, 17, 1, 1.1, 'E');
    return finish(g);
  }

  // Perched and watching, wings raised - the wind-up before a stoop.
  g.capsule(6.5, 5, 11, 10, 2.4, 'G'); // far wing, up
  g.ellipse(11.5, 13, 6.2, 4.4, 'f'); // body
  g.ellipse(5.5, 14, 3.2, 2.2, 'f'); // tail
  g.capsule(15, 11.5, 18, 9, 2.2, 'f'); // neck
  g.ellipse(18.2, 8.2, 2.9, 2.7, 'f'); // head
  g.ellipse(11, 15, 4.4, 1.8, 'A'); // barred underside
  g.capsule(8, 6, 12.5, 11, 2.6, 'f'); // near wing, up
  g.capsule(20.4, 8.4, 22, 9, 1.2, 'k'); // hooked beak
  g.set(21.6, 9.6, 'k');
  g.ellipse(19.2, 7.4, 1.1, 1.2, 'E');
  g.set(18.8, 7, 'W');
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
