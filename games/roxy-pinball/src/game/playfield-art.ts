/**
 * The playfield's printed artwork, drawn flat.
 *
 * On a real table this is the screen-printed wood under the ball: the backyard,
 * the lettering, the lamp housings. It never moves, so it is drawn once into a
 * canvas and handed to the renderer as a texture rather than redrawn every
 * frame. Everything that does move - the ball, the flippers, the targets, and
 * the lamps when they light - is a real object above this, in `scene.ts`.
 *
 * Keeping the split here rather than in the renderer means the artwork is still
 * ordinary 2D canvas code: a paw print is a path, not a mesh.
 */
import { PALETTE, dim } from './theme';
import { drawBone, drawPaw, drawRoxySitting } from './roxy';
import { MISSIONS } from './missions';
import { TOP_LANES } from './table';
import {
  DOGHOUSE,
  DROP_TARGETS,
  LANE_WALL,
  SQUIRREL,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from './table';

/** Where each mission's lamp sits. Shared with the renderer, which lights them. */
export const MISSION_LAMPS = MISSIONS.map((mission, index) => ({
  id: mission.id,
  short: mission.short,
  x: 122 + (index % 3) * 51,
  y: 384 + Math.floor(index / 3) * 24,
  width: 46,
  height: 16,
}));

/** The two orbit arrows, which the renderer lights when a mission wants them. */
export const ORBIT_ARROWS = [
  { id: 'orbit-left', x: 40, y: 232, facing: 1 },
  { id: 'orbit-right', x: 306, y: 232, facing: -1 },
] as const;

export const LANE_INSERT = { width: 30, height: 26, radius: 8 } as const;

/** How many canvas pixels to draw per table pixel. Two is plenty at any zoom. */
export const ART_SCALE = 2;

export function drawPlayfieldArt(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.scale(ART_SCALE, ART_SCALE);
  deck(ctx);
  backyard(ctx);
  laneInserts(ctx);
  orbitArrows(ctx);
  missionLamps(ctx);
  targetHousings(ctx);
  doghouseSurround(ctx);
  ctx.restore();
}

function deck(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
  gradient.addColorStop(0, PALETTE.deckLight);
  gradient.addColorStop(0.45, PALETTE.deck);
  gradient.addColorStop(1, PALETTE.cabinet);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  // A pool of light down the middle, the way the lamps under a real table's
  // plastics pick out the centre and leave the edges in shadow. Baked in
  // rather than lit, because it is paint on the wood, not a lamp.
  const pool = ctx.createRadialGradient(173, 300, 0, 173, 300, 280);
  pool.addColorStop(0, 'rgba(90, 62, 148, 0.55)');
  pool.addColorStop(1, 'rgba(90, 62, 148, 0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
}

function backyard(ctx: CanvasRenderingContext2D): void {
  ctx.save();

  // A fence across the top of the playfield: this is a back garden at night.
  ctx.strokeStyle = dim(PALETTE.wood, 0.55);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let x = 78; x <= 268; x += 17) {
    ctx.beginPath();
    ctx.moveTo(x, 150);
    ctx.lineTo(x, 262);
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  for (const y of [172, 236]) {
    ctx.beginPath();
    ctx.moveTo(74, y);
    ctx.lineTo(272, y);
    ctx.stroke();
  }

  // Grass along the bottom. It stops at the lane wall, because grass growing up
  // the shooter lane looks like a bug.
  const grassRight = LANE_WALL[3]?.x ?? TABLE_WIDTH;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, grassRight, TABLE_HEIGHT);
  ctx.clip();
  ctx.fillStyle = dim(PALETTE.grass, 0.7);
  ctx.beginPath();
  ctx.moveTo(0, TABLE_HEIGHT);
  ctx.lineTo(0, 600);
  for (let x = 0; x <= grassRight; x += 20) {
    ctx.quadraticCurveTo(x + 5, 588, x + 10, 600);
    ctx.quadraticCurveTo(x + 15, 612, x + 20, 600);
  }
  ctx.lineTo(grassRight, TABLE_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Roxy herself, between the slingshots: under where the ball is played rather
  // than where the lamps are read, so nothing important is ever behind her.
  drawRoxySitting(ctx, 173, 462, 62, { ghost: 0.72, squint: 0.9, tongue: 0.8 });

  // Paw prints running up each orbit, pointing the way round.
  ctx.fillStyle = dim(PALETTE.railBright, 0.22);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    drawPaw(ctx, 32 + t * 4, 400 - t * 190, 15, 0.1);
    drawPaw(ctx, 314 - t * 4, 400 - t * 190, 15, -0.1);
  }

  // Bones scattered where nothing else lives, so the deck is never blank.
  ctx.fillStyle = dim(PALETTE.ink, 0.16);
  drawBone(ctx, 120, 470, 26, -0.4);
  drawBone(ctx, 228, 470, 26, 0.5);
  drawBone(ctx, 173, 268, 30, 0.1);

  ctx.restore();
}

/** The lamp housings for R-O-X-Y, painted dark. The renderer lights them. */
function laneInserts(ctx: CanvasRenderingContext2D): void {
  for (const lane of TOP_LANES) {
    ctx.fillStyle = dim(PALETTE.green, 0.26);
    ctx.beginPath();
    ctx.roundRect(
      lane.center.x - LANE_INSERT.width / 2,
      lane.center.y - LANE_INSERT.height / 2,
      LANE_INSERT.width,
      LANE_INSERT.height,
      LANE_INSERT.radius,
    );
    ctx.fill();

    ctx.fillStyle = dim(PALETTE.ink, 0.55);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lane.letter, lane.center.x, lane.center.y + 1);
  }
}

function orbitArrows(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = dim(PALETTE.amber, 0.3);
  for (const arrow of ORBIT_ARROWS) {
    ctx.save();
    ctx.translate(arrow.x, arrow.y);
    ctx.scale(1, arrow.facing);
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(10, 2);
    ctx.lineTo(4, 2);
    ctx.lineTo(4, 13);
    ctx.lineTo(-4, 13);
    ctx.lineTo(-4, 2);
    ctx.lineTo(-10, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Six lamps down the middle, one per mission. The names are painted on; whether
 * a lamp is lit, flashing or dark is the renderer's business.
 */
function missionLamps(ctx: CanvasRenderingContext2D): void {
  for (const lamp of MISSION_LAMPS) {
    ctx.fillStyle = dim(PALETTE.sky, 0.24);
    ctx.beginPath();
    ctx.roundRect(lamp.x - lamp.width / 2, lamp.y - lamp.height / 2, lamp.width, lamp.height, 6);
    ctx.fill();

    ctx.fillStyle = dim(PALETTE.ink, 0.5);
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lamp.short, lamp.x, lamp.y + 1);
  }
}

/** The slots the drop targets rise out of, and the squirrel's back plate. */
function targetHousings(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(7, 4, 15, 0.75)';
  for (const spec of DROP_TARGETS) {
    ctx.fillRect(spec.a.x - 4, spec.a.y - 1, 8, spec.b.y - spec.a.y + 2);
  }
  ctx.fillRect(SQUIRREL.a.x - 6, SQUIRREL.a.y - 4, 12, SQUIRREL.b.y - SQUIRREL.a.y + 8);
}

/** The painted ring around the doghouse mouth. The kennel itself is a model. */
function doghouseSurround(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(7, 4, 15, 0.8)';
  ctx.beginPath();
  ctx.ellipse(DOGHOUSE.x, DOGHOUSE.y + 4, 20, 16, 0, 0, Math.PI * 2);
  ctx.fill();
}
