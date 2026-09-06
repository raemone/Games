// Headless ball tracer. Launches a ball from a chosen place at a chosen speed,
// runs the real physics for a while, and draws its path over the table's
// geometry so a stuck ball or a dead shot can be seen rather than guessed at.
//
//   node --experimental-strip-types tools/sim.mjs <out.png> [preset]
import { writeFileSync } from 'node:fs';

import { encodePng } from './png.mjs';
import { makeBall, makeFlipper, step } from '../src/game/physics.ts';
import {
  DRAIN_Y,
  PLUNGER_MIN_SPEED,
  FLIPPER_ACTIVE_ANGLE,
  FLIPPER_LEFT_PIVOT,
  FLIPPER_LENGTH,
  FLIPPER_REST_ANGLE,
  FLIPPER_RIGHT_PIVOT,
  PLUNGER_MAX_SPEED,
  PLUNGER_REST,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  staticColliders,
  standingDropTargets,
  tableTriggers,
} from '../src/game/table.ts';

const out = process.argv[2] ?? 'sim.png';
const preset = process.argv[3] ?? 'plunge';
const power = Number(process.argv[4] ?? 1);

const flippers = [
  makeFlipper(FLIPPER_LEFT_PIVOT, FLIPPER_LENGTH, FLIPPER_REST_ANGLE, FLIPPER_ACTIVE_ANGLE),
  makeFlipper(
    FLIPPER_RIGHT_PIVOT,
    FLIPPER_LENGTH,
    Math.PI - FLIPPER_REST_ANGLE,
    Math.PI - FLIPPER_ACTIVE_ANGLE,
  ),
];

// A ball sitting on a resting flipper, `along` of the way out from the pivot.
function cradle(flipper, along) {
  const dx = Math.cos(flipper.restAngle);
  const dy = Math.sin(flipper.restAngle);
  const gap = 16.2;
  const side = flipper.pivot.x < 173 ? 1 : -1;
  return makeBall(
    flipper.pivot.x + dx * flipper.length * along + dy * gap * side,
    flipper.pivot.y + dy * flipper.length * along - dx * gap * side,
  );
}

const starts = {
  plunge: () =>
    makeBall(
      PLUNGER_REST.x,
      PLUNGER_REST.y,
      0,
      -(PLUNGER_MIN_SPEED + (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED) * power),
    ),
  left: () => cradle(flippers[0], power),
  right: () => cradle(flippers[1], power),
  centre: () => makeBall(173, 300, 0, 0),
};

const ball = (starts[preset] ?? starts.plunge)();
const world = {
  colliders: [...staticColliders(), ...standingDropTargets([false, false, false, false])],
  triggers: tableTriggers(),
  flippers,
  balls: [ball],
};

const path = [];
const fired = [];
let drainedAt = null;
const TICKS = 1800;
for (let t = 0; t < TICKS; t++) {
  // Flip whenever the ball is in reach, so the trace shows what a player would
  // actually get rather than a ball that dribbles straight down the middle.
  if (preset === 'left') flippers[0].held = t > 4 && t < 30;
  if (preset === 'right') flippers[1].held = t > 4 && t < 30;
  const hits = step(world);
  for (const hit of hits) {
    if (hit.kind === 'trigger' || hit.kind === 'post') fired.push(`${t}:${hit.id}`);
  }
  path.push({ x: ball.x, y: ball.y });
  if (ball.y > DRAIN_Y) {
    drainedAt = t;
    break;
  }
}

const tail = path.slice(-120);
const still =
  tail.length === 120 &&
  Math.max(...tail.map((p) => p.x)) - Math.min(...tail.map((p) => p.x)) < 3 &&
  Math.max(...tail.map((p) => p.y)) - Math.min(...tail.map((p) => p.y)) < 3;

console.log(`preset=${preset} power=${power}`);
console.log(`drained=${drainedAt ?? 'no'} ticks=${path.length} stuck=${still}`);
console.log(`final=(${ball.x.toFixed(1)}, ${ball.y.toFixed(1)}) v=(${ball.vx.toFixed(2)}, ${ball.vy.toFixed(2)})`);
console.log(`events: ${fired.slice(0, 40).join(' ')}${fired.length > 40 ? ' ...' : ''}`);

const W = TABLE_WIDTH;
const H = TABLE_HEIGHT;
const rgba = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = 12;
  rgba[i * 4 + 1] = 10;
  rgba[i * 4 + 2] = 26;
  rgba[i * 4 + 3] = 255;
}
const put = (x, y, c) => {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  const i = (py * W + px) * 4;
  rgba[i] = c[0];
  rgba[i + 1] = c[1];
  rgba[i + 2] = c[2];
};
const line = (a, b, c) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)) * 2);
  for (let i = 0; i <= steps; i++) {
    put(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, c);
  }
};
const ring = (c, r, colour) => {
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    put(c.x + Math.cos(t) * r, c.y + Math.sin(t) * r, colour);
  }
};

for (const collider of world.colliders) {
  if (collider.kind === 'wall') line(collider.a, collider.b, [200, 200, 220]);
  else ring(collider.center, collider.radius, [255, 120, 160]);
}
for (const trigger of world.triggers) ring(trigger.center, trigger.radius, [70, 140, 100]);
for (const flipper of flippers) {
  const tip = {
    x: flipper.pivot.x + Math.cos(flipper.restAngle) * flipper.length,
    y: flipper.pivot.y + Math.sin(flipper.restAngle) * flipper.length,
  };
  line(flipper.pivot, tip, [255, 255, 255]);
}
for (let i = 1; i < path.length; i++) {
  const fade = Math.floor(60 + (195 * i) / path.length);
  line(path[i - 1], path[i], [fade, 220, 120]);
}
writeFileSync(out, encodePng(W, H, rgba));
console.log(`wrote ${out}`);
