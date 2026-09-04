// Roxy's colour palette. Every sprite in the game draws from this, so the whole
// thing reads as one set even though the pieces are authored separately.
export const PAL = {
  '.': '#00000000', // transparent
  o: '#4a2c12', // outline, warm dark brown
  D: '#a86c28', // dark gold (ears, shading)
  M: '#d99a45', // mid gold (body)
  L: '#f2c268', // light gold (highlights)
  // Feathering is a warm light gold, not an off-white. Near-white against gold
  // reads as exposed bone rather than as fur, which made her look ill.
  C: '#f4d69c', // light gold feathering
  c: '#fbead0', // pale cream, for small accents only - chin, paw tips
  E: '#241708', // eye
  W: '#ffffff', // eye highlight
  N: '#2b1b10', // nose
  T: '#e8687a', // tongue
  R: '#e8749c', // collar - pink, and a full band rather than a slash at the throat
  r: '#c04f76', // collar shadow
  Y: '#ffd88a', // collar tag / sparkle
  S: '#8a93a6', // stone and metal
  // Ducks. White everywhere - they are the same bird in every world.
  q: '#f4f8fc', // duck white
  Q: '#ccd9e6', // duck shading
  k: '#f2a03d', // bill and feet
  K: '#cf7c1e', // bill shading
};
