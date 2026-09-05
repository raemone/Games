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
  R: '#d94b4b', // spring pads, the kennel roof, the checkpoint bowl
  Y: '#ffd88a', // collar tag / sparkle
  S: '#8a93a6', // stone and metal
  // The bone. Near-black outline and a grey rim rather than the warm brown
  // used elsewhere, so it stays legible on grass, snow and sand alike.
  n: '#17161c',
  g: '#c9ccd2',
  // Roxy's own outline: a cool dark navy rather than the warm brown used on
  // the scenery, which is what makes her read as the foreground character.
  B: '#2f3d4f',
  // The star power-up: brighter and cooler-gold than Roxy's own palette, so it
  // reads as a special item rather than as another piece of her.
  j: '#ffd633',
  J: '#e8a41e',
  // Pigeons: cool slate with a green-purple sheen at the neck.
  h: '#9aa6b8',
  H: '#6f7d92',
  v: '#7fb08a',
  // Falcons: dark warm brown, barred paler underneath.
  f: '#7a5233',
  G: '#573922',
  A: '#d9bb92',
  // Ducks. White everywhere - they are the same bird in every world.
  q: '#f4f8fc', // duck white
  Q: '#ccd9e6', // duck shading
  k: '#f2a03d', // bill and feet
  K: '#cf7c1e', // bill shading
};
