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
 * Things:  P spawn  G goal  o bone  S spring  < > side springs  ~ boost
 *          E walker  V flyer  ^ spike  C checkpoint  X crate  H,I platforms
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
    '                        ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** A rolling hill. The whole point of the slope physics. */
  hill: seg([
    '                        ',
    '          o o o         ',
    '                        ',
    '        /######L        ',
    '       /########L       ',
    '      /##########L      ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** A gentler 22.5 degree rise, which keeps more speed than a 45. */
  slope: seg([
    '                        ',
    '                        ',
    '             o o o      ',
    '           ab######     ',
    '         ab########     ',
    '       ab##########     ',
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
    '#####L          /#######',
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** A gap. Miss it and you fall out of the level. */
  gap: seg([
    '                        ',
    '                        ',
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
    '#######        #########',
    '#######        #########',
    '#######        #########',
    '#######        #########',
  ]),

  /** Spring up to a high shelf stacked with bones. */
  spring: seg([
    '                        ',
    '            o o o o     ',
    '           =========    ',
    '                        ',
    '                        ',
    '     S                  ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Two patrolling enemies with room to bop both in one jump. */
  walkers: seg([
    '                        ',
    '                        ',
    '        o    o          ',
    '                        ',
    '      E         E       ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Flyers over a gap - the awkward combination, on purpose. */
  flyers: seg([
    '                        ',
    '      V          V      ',
    '                        ',
    '         o o o          ',
    '                        ',
    '########        ########',
    '########        ########',
    '########        ########',
    '########        ########',
  ]),

  /** Spikes on the floor. Jump them, or take the hit. */
  spikes: seg([
    '                        ',
    '                        ',
    '        o o o           ',
    '                        ',
    '        ^^^^            ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Crates to smash, with a bone behind each. */
  crates: seg([
    '                        ',
    '                        ',
    '                        ',
    '       X      X         ',
    '      oX  E   Xo        ',
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

  /** Two routes: a high road on platforms, a low road past an enemy. */
  split: seg([
    '                        ',
    '     o o o o o          ',
    '   ==========           ',
    '                  ====  ',
    '        E      o        ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Stepped climb. Deliberately slow - a breather between fast sections. */
  climb: seg([
    '                o o     ',
    '             ______     ',
    '                        ',
    '        ______          ',
    '                        ',
    '  ______                ',
    FLOOR,
    FLOOR,
    FLOOR,
    FLOOR,
  ]),

  /** Checkpoint. Always on flat ground so it cannot be missed. */
  checkpoint: seg([
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '          C             ',
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
