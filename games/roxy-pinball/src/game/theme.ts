/**
 * One palette for the whole table, so the playfield, the HUD and the menus
 * cannot drift apart. The family is the same deep indigo the rest of the Games
 * site uses, read here as a back garden after dark: the table is the lit thing
 * in it, and every insert that matters is warm against the cold background.
 */
export const PALETTE = {
  space: '#07040f',
  cabinet: '#150c26',
  deck: '#1b1030',
  deckLight: '#2a1b4a',
  rail: '#8f7bc0',
  railBright: '#d9c9ff',
  ink: '#f4ecff',
  muted: '#b9a8d8',
  gold: '#ffd88a',
  amber: '#ffb46b',
  pink: '#ff9ec4',
  green: '#8ce0b0',
  sky: '#8fd6ff',
  red: '#ff7a7a',
  grass: '#2f5d40',
  wood: '#6b4423',
} as const;

/** An insert that is off is not invisible - it is the same lamp, unlit. */
export function insertColour(colour: string, lit: boolean): string {
  return lit ? colour : dim(colour, 0.28);
}

/** Mix a hex colour towards the deck colour. Cheaper than a canvas filter. */
export function dim(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const mix = (channel: number, target: number): number =>
    Math.round(channel * amount + target * (1 - amount));
  return `rgb(${mix(r, 27)}, ${mix(g, 16)}, ${mix(b, 48)})`;
}

/** A soft radial glow, for lit inserts and the ball's own light. */
export function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colour: string,
  strength = 0.5,
): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, colour);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha *= strength;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
