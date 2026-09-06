// Draws the table's collision geometry to a PNG so the layout can be checked by
// eye without a browser. Nothing in the game depends on this - it exists so a
// moved bumper can be seen rather than imagined.
//
// Run with `npm run table`; the PNG is written to the scratch path given as the
// first argument, defaulting to ./table-preview.png. It is not committed.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from './png.mjs';
import {
  BUMPERS,
  DROP_TARGETS,
  FLIPPER_ACTIVE_ANGLE,
  FLIPPER_LEFT_PIVOT,
  FLIPPER_LENGTH,
  FLIPPER_REST_ANGLE,
  FLIPPER_RIGHT_PIVOT,
  PLUNGER_REST,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  staticColliders,
  standingDropTargets,
  tableTriggers,
} from '../src/game/table.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, '..', 'table-preview.png');

const W = TABLE_WIDTH;
const H = TABLE_HEIGHT;
const rgba = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = 12;
  rgba[i * 4 + 1] = 10;
  rgba[i * 4 + 2] = 26;
  rgba[i * 4 + 3] = 255;
}

function put(x, y, [r, g, b]) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  const i = (py * W + px) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
}

function line(a, b, colour) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)) * 2);
  for (let i = 0; i <= steps; i++) {
    put(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, colour);
  }
}

function circle(center, radius, colour, filled = false) {
  const steps = Math.max(24, Math.ceil(radius * 12));
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    put(center.x + Math.cos(t) * radius, center.y + Math.sin(t) * radius, colour);
  }
  if (!filled) return;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) put(center.x + x, center.y + y, colour);
    }
  }
}

const WHITE = [235, 235, 245];
const GATE = [120, 200, 255];
const KICK = [255, 120, 160];
const TRIGGER = [90, 200, 140];
const TARGET = [255, 210, 100];
const FLIPPER = [255, 255, 255];
const GHOST = [70, 70, 110];

for (const collider of [...staticColliders(), ...standingDropTargets([])]) {
  if (collider.kind === 'wall') {
    const colour = collider.blockNormal ? GATE : collider.kick ? KICK : collider.id ? TARGET : WHITE;
    line(collider.a, collider.b, colour);
  } else {
    circle(collider.center, collider.radius, collider.kick ? KICK : WHITE, Boolean(collider.kick));
  }
}

for (const trigger of tableTriggers()) circle(trigger.center, trigger.radius, TRIGGER);
for (const bumper of BUMPERS) circle(bumper.center, bumper.radius + 3, KICK);
for (const spec of DROP_TARGETS) line(spec.a, spec.b, TARGET);

for (const [pivot, sign] of [
  [FLIPPER_LEFT_PIVOT, 1],
  [FLIPPER_RIGHT_PIVOT, -1],
]) {
  for (const [angle, colour] of [
    [FLIPPER_REST_ANGLE, FLIPPER],
    [FLIPPER_ACTIVE_ANGLE, GHOST],
  ]) {
    const a = sign === 1 ? angle : Math.PI - angle;
    const tip = { x: pivot.x + Math.cos(a) * FLIPPER_LENGTH, y: pivot.y + Math.sin(a) * FLIPPER_LENGTH };
    line(pivot, tip, colour);
    circle(tip, 7, colour);
    circle(pivot, 7, colour);
  }
}

circle(PLUNGER_REST, 9, [255, 180, 80]);

writeFileSync(out, encodePng(W, H, rgba));
console.log(`wrote ${out}  ${W}x${H}`);
