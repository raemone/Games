// Roxy's colour palette. Every sprite in the game draws from this, so the whole
// thing reads as one set even though the pieces are authored separately.
export const PAL = {
  '.': '#00000000', // transparent
  o: '#4a2c12', // outline, warm dark brown
  D: '#a86c28', // dark gold (ears, shading)
  M: '#d99a45', // mid gold (body)
  L: '#f2c268', // light gold (highlights)
  C: '#fbe6c0', // cream (muzzle, chest, paws)
  E: '#241708', // eye
  W: '#ffffff', // eye highlight
  N: '#2b1b10', // nose
  T: '#e8687a', // tongue
  R: '#d94b4b', // collar
  Y: '#ffd88a', // collar tag / sparkle
  S: '#8a93a6', // stone and metal
  // Enemy bodies, one per world. The behaviour is shared; only the skin changes.
  1: '#b5651d', // Green Park - squirrel
  2: '#dce9f5', // Snowy Peaks - snowball
  3: '#e0603c', // Beach Sunset - crab
};

/** Palette keys for each world's enemies, indexed by world number. */
export const ENEMY_KEYS = { 1: '1', 2: '2', 3: '3' };
