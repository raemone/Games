/**
 * Everything inside the cabinet, drawn in table coordinates.
 *
 * The rule the whole playfield follows: anything the ball can hit is bright and
 * has an edge, and anything that is only decoration is dark and has none. On a
 * small screen a player has a fraction of a second to read where the ball can
 * go, and artwork that competes with the geometry is artwork that loses a ball.
 */
import type { Session } from './session';
import type { Vec } from './physics';
import { PALETTE, dim, glow, insertColour } from './theme';
import { drawBone, drawPaw, drawRoxy, drawRoxySitting } from './roxy';
import { MISSIONS, missionById } from './missions';
import { LANE_LETTERS } from './scoring';
import {
  ARCH_CENTER,
  ARCH_RADIUS,
  BUMPERS,
  DOGHOUSE,
  DOGHOUSE_POCKET,
  DRAIN_Y,
  DROP_TARGETS,
  LANE_EXIT_ANGLE,
  LANE_RADIUS,
  LANE_WALL,
  LEFT_GUIDE,
  LEFT_SLING,
  OUTER_LEFT,
  OUTER_RIGHT,
  OUTLANE_POST,
  OUTLANE_POST_RADIUS,
  PLUNGER_REST,
  RIGHT_GUIDE,
  SEPARATOR_LEFT,
  SQUIRREL,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TOP_LANES,
  TOP_LANE_BOTTOM,
  TOP_LANE_DIVIDERS,
  TOP_LANE_TOP,
  mirrorX,
} from './table';

const RAIL_WIDTH = 4.5;

export function drawTable(ctx: CanvasRenderingContext2D, session: Session, tick: number): void {
  deck(ctx);
  playfieldArt(ctx, session, tick);
  lanes(ctx, session, tick);
  missionInserts(ctx, session, tick);
  doghouse(ctx, session, tick);
  targetBanks(ctx, session);
  bumpers(ctx, session, tick);
  rails(ctx);
  slingshots(ctx);
  flippers(ctx, session);
  plunger(ctx, session);
  balls(ctx, session);
  flashes(ctx, session);
  apron(ctx, session);
}

// ------------------------------------------------------------------- ground

function deck(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, TABLE_HEIGHT);
  gradient.addColorStop(0, PALETTE.deckLight);
  gradient.addColorStop(0.45, PALETTE.deck);
  gradient.addColorStop(1, PALETTE.cabinet);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  // A pool of light around the middle of the playfield, the way the lamps under
  // a real table's plastics pick out the middle and leave the edges in shadow.
  glow(ctx, 173, 300, 260, '#4a2f7d', 0.5);
}

function playfieldArt(ctx: CanvasRenderingContext2D, session: Session, tick: number): void {
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

  // Grass along the bottom of the playfield, under the flippers. It stops at
  // the lane wall, because grass growing up the shooter lane looks like a bug.
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

  // Roxy herself, big and dim, under the middle of the playfield. She is art,
  // not a target, so she sits at the alpha of a shadow.
  // She sits between the slingshots, under where the ball is played rather than
  // where the inserts are read, so nothing important is ever behind her.
  const wag = Math.sin(tick / 26) * 0.05;
  drawRoxySitting(ctx, 173, 462, 62, { ghost: 0.78, squint: 0.9, tongue: 0.8, tilt: wag });

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

  if (session.tilted) {
    ctx.fillStyle = 'rgba(255, 122, 122, 0.09)';
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
  }
}

// -------------------------------------------------------------------- lanes

function lanes(ctx: CanvasRenderingContext2D, session: Session, tick: number): void {
  // The four top lanes. A lit letter is one the player already has this ball.
  TOP_LANES.forEach((lane, index) => {
    const letter = LANE_LETTERS[index];
    const lit = letter ? session.score.lanes[letter] : false;
    const colour = insertColour(PALETTE.green, lit);

    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(lane.center.x - 15, lane.center.y - 13, 30, 26, 8);
    ctx.fill();
    if (lit) glow(ctx, lane.center.x, lane.center.y, 24, PALETTE.green, 0.5);

    ctx.fillStyle = lit ? PALETTE.cabinet : dim(PALETTE.ink, 0.5);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lane.letter, lane.center.x, lane.center.y + 1);
  });

  // The two orbit mouths, lit while the running mission wants them.
  const wantsOrbit =
    session.missions.active !== null &&
    ['fetch', 'walkies'].includes(session.missions.active.id);
  const pulse = 0.5 + 0.5 * Math.sin(tick / 7);
  for (const [x, direction] of [
    [40, 1],
    [306, -1],
  ] as const) {
    ctx.save();
    ctx.fillStyle = insertColour(PALETTE.amber, wantsOrbit);
    ctx.globalAlpha *= wantsOrbit ? 0.5 + pulse * 0.5 : 1;
    drawArrow(ctx, x, 232, direction);
    ctx.restore();
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, facing);
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

/**
 * Six lamps down the middle of the table, one per mission. Lit means finished,
 * flashing means this is the one the doghouse will start - the same language a
 * real table uses, and the only place a player can see the whole set at once.
 */
function missionInserts(ctx: CanvasRenderingContext2D, session: Session, tick: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(tick / 8);
  MISSIONS.forEach((mission, index) => {
    const x = 122 + (index % 3) * 51;
    const y = 384 + Math.floor(index / 3) * 24;
    const done = session.missions.completed.includes(mission.id);
    const selected = session.missions.selected === mission.id && !session.missions.active;
    const running = session.missions.active?.id === mission.id;

    ctx.save();
    if (selected) ctx.globalAlpha *= 0.35 + pulse * 0.65;
    ctx.fillStyle = insertColour(done ? PALETTE.gold : PALETTE.sky, done || selected || running);
    ctx.beginPath();
    ctx.roundRect(x - 23, y - 8, 46, 16, 6);
    ctx.fill();

    ctx.fillStyle = done || selected || running ? PALETTE.cabinet : dim(PALETTE.ink, 0.45);
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mission.short, x, y + 1);
    ctx.restore();
  });
}

// ------------------------------------------------------------------ doghouse

function doghouse(ctx: CanvasRenderingContext2D, session: Session, tick: number): void {
  const lit = session.doghouseLit;
  const wizard = session.missions.wizardLit;
  const pulse = 0.5 + 0.5 * Math.sin(tick / 6);

  ctx.save();
  // The kennel behind the pocket.
  ctx.fillStyle = dim(PALETTE.wood, 0.85);
  ctx.beginPath();
  ctx.moveTo(139, 300);
  ctx.lineTo(173, 268);
  ctx.lineTo(207, 300);
  ctx.lineTo(207, 348);
  ctx.lineTo(139, 348);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = dim(PALETTE.wood, 1.25);
  ctx.beginPath();
  ctx.moveTo(133, 302);
  ctx.lineTo(173, 264);
  ctx.lineTo(213, 302);
  ctx.lineTo(205, 302);
  ctx.lineTo(173, 272);
  ctx.lineTo(141, 302);
  ctx.closePath();
  ctx.fill();

  // The mouth itself, which is the actual shot.
  const mouth = wizard ? PALETTE.gold : PALETTE.pink;
  ctx.fillStyle = insertColour(mouth, lit);
  if (lit) ctx.globalAlpha *= 0.55 + pulse * 0.45;
  ctx.beginPath();
  ctx.moveTo(159, 344);
  ctx.lineTo(159, 312);
  ctx.quadraticCurveTo(173, 296, 187, 312);
  ctx.lineTo(187, 344);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (lit) glow(ctx, DOGHOUSE.x, DOGHOUSE.y, 40, mouth, 0.45);

  // A ball waiting in the saucer sits in the mouth, visible but out of play.
  if (session.saucer) {
    drawBall(ctx, DOGHOUSE.x, DOGHOUSE.y + 4, 9, 0.55);
  }

  ctx.save();
  ctx.strokeStyle = PALETTE.rail;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  strokePath(ctx, DOGHOUSE_POCKET);
  ctx.restore();
}

// ------------------------------------------------------------------ targets

function targetBanks(ctx: CanvasRenderingContext2D, session: Session): void {
  DROP_TARGETS.forEach((spec, index) => {
    const down = session.dropsDown[index] === true;
    const midY = (spec.a.y + spec.b.y) / 2;
    ctx.save();
    if (down) {
      // A dropped target is a slot in the playfield, not an absence.
      ctx.fillStyle = dim(PALETTE.sky, 0.2);
      ctx.fillRect(spec.a.x - 2, spec.a.y, 4, spec.b.y - spec.a.y);
    } else {
      ctx.fillStyle = PALETTE.sky;
      ctx.beginPath();
      ctx.roundRect(spec.a.x - 3.5, spec.a.y, 7, spec.b.y - spec.a.y, 3);
      ctx.fill();
      // The bristles, so the bank reads as four brushes rather than four slabs.
      ctx.strokeStyle = PALETTE.cabinet;
      ctx.lineWidth = 1.2;
      for (let y = spec.a.y + 4; y < spec.b.y - 2; y += 5) {
        ctx.beginPath();
        ctx.moveTo(spec.a.x + 1, y);
        ctx.lineTo(spec.a.x + 3.5, y);
        ctx.stroke();
      }
      glow(ctx, spec.a.x, midY, 16, PALETTE.sky, 0.3);
    }
    ctx.restore();
  });

  // The squirrel: a plate with a very smug animal on it.
  const height = SQUIRREL.b.y - SQUIRREL.a.y;
  ctx.save();
  ctx.fillStyle = PALETTE.amber;
  ctx.beginPath();
  ctx.roundRect(SQUIRREL.a.x - 5, SQUIRREL.a.y - 3, 14, height + 6, 5);
  ctx.fill();
  glow(ctx, SQUIRREL.a.x, SQUIRREL.a.y + height / 2, 26, PALETTE.amber, 0.4);

  ctx.fillStyle = PALETTE.cabinet;
  ctx.save();
  ctx.translate(SQUIRREL.a.x + 1, SQUIRREL.a.y + height / 2);
  ctx.beginPath();
  ctx.ellipse(-1, 3, 4.6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1, -8, 4, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ears, which is what stops the silhouette reading as a cat.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-1 + side * 2.6, -11.5, 1.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // The tail, which is most of a squirrel.
  ctx.beginPath();
  ctx.moveTo(3, 10);
  ctx.quadraticCurveTo(12, 3, 7, -11);
  ctx.quadraticCurveTo(6, -2, 2, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------ bumpers

function bumpers(ctx: CanvasRenderingContext2D, session: Session, tick: number): void {
  const dinner = session.missions.active?.id === 'dinner';
  for (const bumper of BUMPERS) {
    const { x, y } = bumper.center;
    const flash = session.flashes.some(
      (item) => Math.hypot(item.x - x, item.y - y) < bumper.radius + 8,
    );

    ctx.save();
    ctx.fillStyle = dim(PALETTE.railBright, 0.35);
    ctx.beginPath();
    ctx.arc(x, y, bumper.radius + 4, 0, Math.PI * 2);
    ctx.fill();

    const cap = dinner ? PALETTE.green : PALETTE.gold;
    ctx.fillStyle = flash ? PALETTE.ink : cap;
    ctx.beginPath();
    ctx.arc(x, y, bumper.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(21, 12, 38, 0.55)';
    drawPaw(ctx, x, y, bumper.radius * 1.5, Math.sin(tick / 40 + x) * 0.15);
    ctx.restore();

    if (flash || dinner) glow(ctx, x, y, bumper.radius * 2.6, cap, flash ? 0.7 : 0.3);
  }
}

// -------------------------------------------------------------------- rails

function strokePath(ctx: CanvasRenderingContext2D, points: readonly Vec[]): void {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
}

/** Every wall the ball can touch, drawn as one bright metal rail. */
function rails(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const paths = (): void => {
    // The arch and the launch channel's inner wall.
    ctx.beginPath();
    ctx.arc(ARCH_CENTER.x, ARCH_CENTER.y, ARCH_RADIUS, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ARCH_CENTER.x, ARCH_CENTER.y, LANE_RADIUS, 0, LANE_EXIT_ANGLE, true);
    ctx.stroke();

    strokePath(ctx, OUTER_LEFT);
    strokePath(ctx, OUTER_RIGHT);
    strokePath(ctx, LANE_WALL);
    strokePath(ctx, SEPARATOR_LEFT);
    strokePath(ctx, SEPARATOR_LEFT.map(mirrorX));
    strokePath(ctx, LEFT_GUIDE);
    strokePath(ctx, RIGHT_GUIDE);
    for (const x of TOP_LANE_DIVIDERS) {
      strokePath(ctx, [{ x, y: TOP_LANE_TOP }, { x, y: TOP_LANE_BOTTOM }]);
    }
  };

  ctx.strokeStyle = PALETTE.space;
  ctx.lineWidth = RAIL_WIDTH + 3;
  paths();
  ctx.strokeStyle = PALETTE.rail;
  ctx.lineWidth = RAIL_WIDTH;
  paths();
  ctx.strokeStyle = PALETTE.railBright;
  ctx.lineWidth = 1.4;
  paths();
  ctx.restore();

  for (const post of [OUTLANE_POST, mirrorX(OUTLANE_POST)]) {
    ctx.fillStyle = PALETTE.railBright;
    ctx.beginPath();
    ctx.arc(post.x, post.y, OUTLANE_POST_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.rail;
    ctx.beginPath();
    ctx.arc(post.x, post.y, OUTLANE_POST_RADIUS - 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function slingshots(ctx: CanvasRenderingContext2D): void {
  for (const flip of [false, true]) {
    const map = (point: Vec): Vec => (flip ? mirrorX(point) : point);
    const top = map(LEFT_SLING.top);
    const bottom = map(LEFT_SLING.bottom);
    const outer = map(LEFT_SLING.outer);

    ctx.fillStyle = dim(PALETTE.railBright, 0.5);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.closePath();
    ctx.fill();

    // The rubber, which is the only edge of the three that does anything.
    ctx.strokeStyle = PALETTE.pink;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.stroke();
  }
}

function flippers(ctx: CanvasRenderingContext2D, session: Session): void {
  for (const flipper of session.flippers) {
    const tipX = flipper.pivot.x + Math.cos(flipper.angle) * flipper.length;
    const tipY = flipper.pivot.y + Math.sin(flipper.angle) * flipper.length;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.space;
    ctx.lineWidth = flipper.radius * 2 + 3;
    ctx.beginPath();
    ctx.moveTo(flipper.pivot.x, flipper.pivot.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.strokeStyle = session.tilted ? PALETTE.red : PALETTE.gold;
    ctx.lineWidth = flipper.radius * 2;
    ctx.beginPath();
    ctx.moveTo(flipper.pivot.x, flipper.pivot.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(flipper.pivot.x, flipper.pivot.y - 3);
    ctx.lineTo(tipX, tipY - 3);
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ plunger

function plunger(ctx: CanvasRenderingContext2D, session: Session): void {
  const pull = session.plungerCharge * 26;
  const x = PLUNGER_REST.x;
  const top = PLUNGER_REST.y + 14 + pull;

  ctx.save();
  ctx.strokeStyle = PALETTE.rail;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, 640);
  ctx.stroke();

  ctx.fillStyle = session.plungerCharge > 0 ? PALETTE.amber : PALETTE.railBright;
  ctx.beginPath();
  ctx.arc(x, top, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // A charge meter beside the lane, because a plunger you cannot read is a
  // plunger everyone yanks to the top every single time.
  if (session.plungerCharge > 0) {
    ctx.fillStyle = 'rgba(21,12,38,0.8)';
    ctx.fillRect(336, 470, 8, 100);
    ctx.fillStyle = PALETTE.amber;
    ctx.fillRect(336, 570 - session.plungerCharge * 100, 8, session.plungerCharge * 100);
  }
}

// -------------------------------------------------------------------- balls

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const gradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.1, x, y, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.45, '#cfd6e6');
  gradient.addColorStop(1, '#5c6377');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(7,4,15,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function balls(ctx: CanvasRenderingContext2D, session: Session): void {
  for (const ball of session.activeBalls) {
    if (ball.y > DRAIN_Y) continue;
    // A short trail, drawn from the ball's own velocity rather than a history
    // buffer: at these speeds it reads the same and costs nothing to keep.
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 4) {
      ctx.save();
      ctx.globalAlpha *= 0.28;
      ctx.strokeStyle = PALETTE.railBright;
      ctx.lineWidth = ball.radius * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x - ball.vx * 1.6, ball.y - ball.vy * 1.6);
      ctx.stroke();
      ctx.restore();
    }
    drawBall(ctx, ball.x, ball.y, ball.radius);
  }
}

function flashes(ctx: CanvasRenderingContext2D, session: Session): void {
  for (const flash of session.flashes) {
    const t = flash.life / flash.max;
    glow(ctx, flash.x, flash.y, 30 * (1.4 - t), flash.hue, t * 0.8);
  }
}

// -------------------------------------------------------------------- apron

/**
 * The apron: the panel below the flippers that on a real table carries the
 * instruction cards. Here it carries Roxy and whatever the mission wants next,
 * which is the one thing a new player most needs to be told.
 */
function apron(ctx: CanvasRenderingContext2D, session: Session): void {
  ctx.save();
  // It stops at the lane wall: an apron that covered the launch lane would hide
  // the plunger, which is the one control a new player has to find first.
  const apronRight = LANE_WALL[3]?.x ?? TABLE_WIDTH;
  ctx.fillStyle = PALETTE.cabinet;
  ctx.fillRect(0, 616, apronRight, TABLE_HEIGHT - 616);

  ctx.strokeStyle = PALETTE.rail;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 616);
  ctx.lineTo(apronRight, 616);
  ctx.stroke();

  drawRoxy(ctx, 42, 650, 46, { squint: 0.9, tongue: 0.7, tilt: -0.12 });

  const active = session.missions.active;
  const hint = active
    ? missionById(active.id).hint
    : session.missions.wizardLit
      ? 'Shoot the doghouse for Best in Show'
      : `Shoot the doghouse to start ${missionById(session.missions.selected).name}`;

  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(hint, 76, 641);

  if (active) {
    const definition = missionById(active.id);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(
      `${definition.name}  ${active.progress}/${active.goal}  ${Math.ceil(active.ticksLeft / 60)}s`,
      76,
      661,
    );
  } else {
    ctx.fillStyle = dim(PALETTE.ink, 0.55);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(
      `Missions ${session.missions.completed.length}/${MISSIONS.length}`,
      76,
      661,
    );
  }
  ctx.restore();
}
