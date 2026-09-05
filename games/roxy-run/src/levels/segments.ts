/**
 * Level building blocks. Each segment is 24 tiles wide and 20 tall, authored as
 * ASCII and bottom-aligned, so only the rows that actually contain something
 * need writing.
 *
 * Levels are ordered lists of these. Hand-authoring nine full-length maps would
 * be unreadable and undiffable; composing them from named pieces keeps the
 * design legible and lets all three worlds share a terrain vocabulary.
 *
 * Terrain: # solid  / rise 45  L fall 45  a,b rise 22.5  c,d fall 22.5
 *          _ half height  = one-way platform  - shallow lip
 * Things:  P spawn  G goal  o bone  * star  S spring  < > side springs
 *          ~ boost  E walker  V flyer  p pigeon  F falcon  ^ spike  X crate
 *          H,I moving platforms
 */

export const SEGMENT_WIDTH = 24;
export const SEGMENT_HEIGHT = 20;

/**
 * The row every segment's ground surface sits on.
 *
 * Segments are stitched edge to edge, so if two of them disagree about where
 * the floor is, the join becomes an invisible 16px step that Roxy walks into
 * and sticks on. A test asserts every segment honours this.
 */
export const GROUND_ROW = 16;

/** Pad rows to full width and bottom-align them within the segment. */
function seg(rows: string[]): string[] {
  const padded = rows.map((row) => {
    if (row.length > SEGMENT_WIDTH) {
      throw new Error(`segment row is ${row.length} wide, max ${SEGMENT_WIDTH}`);
    }
    return row.padEnd(SEGMENT_WIDTH, ' ');
  });
  const blanks = SEGMENT_HEIGHT - padded.length;
  if (blanks < 0) throw new Error(`segment is ${padded.length} rows, max ${SEGMENT_HEIGHT}`);
  return [...new Array<string>(blanks).fill(' '.repeat(SEGMENT_WIDTH)), ...padded];
}

const FLOOR = '########################';

export const SEGMENTS = {
  /** Opening stretch: flat, safe, a few bones to teach that bones are good. */
  start: seg([
    '                        ',
    '                        ',
    '                        ',
    '              o o o     ',
    '   P                    ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Flat running room - lets speed build before something happens. */
  flat: seg([
    '                        ',
    '                        ',
    '                        ',
    '        o o o o         ',
    '   X            X       ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** A rolling hill. The whole point of the slope physics. */
  hill: seg([
    '                        ',
    '          o o o         ',
    '         E    E         ',
    '        /######L        ',
    '       /########L       ',
    '      /##########L      ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /**
   * A gentle 22.5 degree rise that keeps more speed than a 45, and comes back
   * down inside its own tiles.
   *
   * It used to end on the shelf. A three-tile drop at a segment join reads to a
   * running player as a pit - you jump it - and the arc off the top carries
   * clean over the next segment's near bank and into whatever hole it starts
   * with. Every rise gets a matching fall.
   */
  slope: seg([
    '                        ',
    '                        ',
    '          o o o o       ',
    '           ab###cd      ',
    '         ab#######cd    ',
    '       ab###########cd  ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Drop off a ledge into a dip, then climb back out. */
  dip: seg([
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '      o o o o o o       ',
    '#####L  E    E  /#######',
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /**
   * A gap. Miss it and you fall out of the level.
   *
   * The flyer guards the landing, not the approach or the pit itself. Over the
   * pit it is a death trap - a hit knocks you backwards and barely up. On the
   * near bank it is nearly as bad, because bopping it launches you into an arc
   * that ends in the hole.
   */
  gap: seg([
    '                        ',
    '                   V    ',
    '        o o o o         ',
    '                        ',
    '                        ',
    '#########      #########',
    '#########      #########',
    '#########      #########',
    '#########      #########',
  ]),

  /** A gap crossed on a moving platform instead of by jumping. */
  ride: seg([
    '                        ',
    '                        ',
    '          o o           ',
    '                        ',
    '            H           ',
    '#########      #########',
    '#########      #########',
    '#########      #########',
    '#########      #########',
  ]),

  /**
   * Spring up to a shelf of bones, then step back down.
   *
   * The shelf used to end in a four-tile drop, and a running player reads that
   * as a pit and jumps - an arc long enough to clear the next segment's bank
   * and land in its hole. Coming down a tile at a time keeps her grounded.
   */
  spring: seg([
    '                        ',
    '          o o o o       ',
    '         ========       ',
    '                 ==     ',
    '                   ==   ',
    '     S               == ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Two patrolling enemies with room to bop both in one jump. */
  walkers: seg([
    '                        ',
    '                        ',
    '        o    o     o    ',
    '           X            ',
    '      E         E    E  ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /**
   * A pit guarded at both ends. The flyers sit over the banks, not the hole:
   * one over open air turns a good jump into a fall, since a hit knocks you
   * backwards. They make the approach and the landing awkward instead.
   *
   * Everything sits past the landing, and the near bank is left completely
   * clear. A crate there stops you dead a stride before the jump; a flyer is
   * worse, because bopping it launches you into an arc that ends in the hole.
   */
  flyers: seg([
    '                        ',
    '                  V  V  ',
    '                        ',
    '         o o o          ',
    '  *             X    X  ',
    '#########      #########',
    '#########      #########',
    '#########      #########',
    '#########      #########',
  ]),

  /** Spikes on the floor. Jump them, or take the hit. */
  spikes: seg([
    '                        ',
    '         o o o          ',
    '        ======          ',
    '                   o    ',
    '        ^^^^     ^^^    ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Crates to smash, with a bone behind each. */
  crates: seg([
    '                        ',
    '                        ',
    '     X          X       ',
    '     X  X     X X    X  ',
    '    oX  X  E  X X o  X  ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** A boost pad firing into a ramp - the reward run of the level. */
  boost: seg([
    '                        ',
    '                        ',
    '          o o o o       ',
    '        ab######cd      ',
    '   ~  ab##########cd    ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Two routes: a high road of stepped platforms, a low road past the ducks. */
  split: seg([
    '     o o o o            ',
    '   ========             ',
    '           ==           ',
    '             ==     o   ',
    '  X   E        ==     E ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /**
   * An optional staircase of platforms carrying bones, over clear ground.
   *
   * Every step down is one tile. That matters more than it looks: a running
   * player - and the bot in the tests - reads any drop taller than a stride as
   * a pit and jumps it, and the leap off a three-tile ledge at a segment join
   * carries clean over the next segment's bank and into whatever hole it
   * starts with. Small steps keep her feet on the ground where it matters.
   */
  climb: seg([
    '        o o             ',
    '                        ',
    '     ======             ',
    '           ===          ',
    '              ===       ',
    '   E             ===    ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** A flock of ducks, with a platform route over the top of them. */
  duckpond: seg([
    '                        ',
    '     o o    *   o o     ',
    '    =====      =====    ',
    '                        ',
    '  E    E     E      E   ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Stacked crates to smash through, with ducks patrolling between them. */
  crateyard: seg([
    '                        ',
    '                        ',
    '                        ',
    '    X       X       X   ',
    '  o X o  E  X o  E  X o ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Three spike beds with stepping stones above - hop across or jump them. */
  gauntlet: seg([
    '                        ',
    '  *   o    o    o       ',
    '     ===  ===  ===      ',
    '                        ',
    '    ^^^   ^^^   ^^^     ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Staggered platforms to climb, with ducks waiting underneath. */
  towers: seg([
    '        o    *   o      ',
    '      ====     ====     ',
    '                        ',
    '  ====      ====        ',
    '   o   E     o    E     ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /**
   * A stepping stone in the middle of a pit, with flyers guarding the landing.
   * One island rather than several: split into stones with gaps between them,
   * the gaps have to be cleared from a standstill in mid-air, which is not a
   * jump anyone can make.
   */
  bridge: seg([
    '                        ',
    '                  V  V  ',
    '                        ',
    '          o  o          ',
    '          ====          ',
    '#########      #########',
    '#########      #########',
    '#########      #########',
    '#########      #########',
  ]),

  /** A flight of pigeons crossing at two heights, with crates underneath. */
  pigeons: seg([
    '                        ',
    '   p           p        ',
    '                        ',
    '         p              ',
    '     o     X   o    X   ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Falcons perched high, waiting to stoop on whatever passes beneath. */
  falcons: seg([
    '     F           F      ',
    '                        ',
    '                        ',
    '        o o o o         ',
    '   X          E      X  ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Everything at once: a falcon over a duck, pigeons above, crates between. */
  aviary: seg([
    '            F           ',
    '   p                p   ',
    '                        ',
    '      o   X   X   o     ',
    '   E     X     X     E  ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** A long open run to build speed back up after a crowded stretch. */
  meadow: seg([
    '                        ',
    '                        ',
    '      o o o o o o       ',
    '                        ',
    '   X                 X  ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** The end: a last run of bones and the kennel. */
  finish: seg([
    '                        ',
    '                        ',
    '                        ',
    '    o o o o             ',
    '                G       ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),
} as const;

export type SegmentName = keyof typeof SEGMENTS;

/** Stitch segments side by side into the rows a LevelDef needs. */
export function buildRows(names: readonly SegmentName[]): string[] {
  const rows: string[] = [];
  for (let y = 0; y < SEGMENT_HEIGHT; y++) {
    rows.push(names.map((name) => SEGMENTS[name][y] ?? '').join(''));
  }
  return rows;
}
