/**
 * Draws a Session into the 480x270 world buffer: sky, two parallax layers,
 * tiles, entities and Roxy. Nothing here mutates the simulation, so a frame
 * can be drawn twice without consequence.
 */
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../engine/renderer';
import { TILE } from './collision';
import { ONE_WAY_SHAPE } from './tiles';
import type { Session } from './session';
import type { RoxyAnimation, Sprites } from './sprites';
import { LAYER_HEIGHT, LAYER_WIDTH, buildBackdrop, type Backdrop } from './backdrop';
import { GROUND_ROW } from '../levels/segments';
import { buildTileset } from './terrain';
import type { Theme } from './theme';
import type { Entity } from './entities';

/**
 * Where the scenery stands. Backdrops are anchored to the level's shared
 * ground line rather than to the bottom of the screen - anchor them to the
 * screen and the terrain simply buries them.
 */
const GROUND_LINE = GROUND_ROW * TILE;
/** Flecks are scattered over this many screens and wrapped. */
const FLECK_FIELD = 3;
/** Half the kennel sprite's height, so it sits on the ground it spawns over. */
const GOAL_ART_HALF_HEIGHT = 22;

/** Ticks per animation frame. Running cycles faster the faster Roxy goes. */
function frameDelay(animation: RoxyAnimation, speed: number): number {
  switch (animation) {
    case 'run':
      return Math.max(2, 8 - Math.floor(Math.abs(speed)));
    case 'roll':
      return Math.max(1, 5 - Math.floor(Math.abs(speed) / 2));
    case 'walk':
      return Math.max(4, 12 - Math.floor(Math.abs(speed) * 3));
    case 'idle':
      return 16;
    default:
      return 8;
  }
}

export class WorldRenderer {
  private readonly tileset: HTMLCanvasElement;
  private readonly backdrop: Backdrop;
  private readonly sky: CanvasGradient;
  /** Free-running counter for drifting flecks and shimmering water. */
  private weatherTick = 0;

  private animation: RoxyAnimation = 'idle';
  private frame = 0;
  private frameTimer = 0;

  constructor(
    private readonly theme: Theme,
    private readonly sprites: Sprites,
    ctx: CanvasRenderingContext2D,
  ) {
    this.tileset = buildTileset(theme).canvas;
    this.backdrop = buildBackdrop(theme);

    this.sky = ctx.createLinearGradient(0, 0, 0, VIRTUAL_HEIGHT);
    this.sky.addColorStop(0, theme.sky[0]);
    this.sky.addColorStop(1, theme.sky[1]);
  }

  draw(ctx: CanvasRenderingContext2D, session: Session): void {
    const shake = session.camera.shakeOffset;
    const camX = Math.round(session.camera.x + shake.x);
    const camY = Math.round(session.camera.y + shake.y);

    this.weatherTick += 1;

    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    this.drawSun(ctx, camX, camY);
    this.drawParallax(ctx, camX, camY);
    this.drawFlecks(ctx, camX, camY);
    this.drawTiles(ctx, session, camX, camY);
    this.drawChase(ctx, session, camX, camY);
    this.drawEntities(ctx, session, camX, camY);
    this.drawLooseBones(ctx, session, camX, camY);
    this.drawRoxy(ctx, session, camX, camY);
    this.drawPopups(ctx, session, camX, camY);
  }

  private drawParallax(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const layer of this.backdrop.layers) {
      const offset = Math.round(camX * layer.factor) % LAYER_WIDTH;
      // Distant layers rise and fall less than near ones as the camera moves,
      // which is the vertical half of the parallax.
      const groundY = GROUND_LINE - camY * (0.65 + layer.factor * 0.35);
      const y = Math.round(groundY - LAYER_HEIGHT + layer.offsetY);
      ctx.globalAlpha = layer.alpha;
      // Two copies is enough: each layer is exactly one screen wide.
      for (let x = -offset - LAYER_WIDTH; x < VIRTUAL_WIDTH; x += LAYER_WIDTH) {
        ctx.drawImage(layer.canvas, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The sun sits behind everything and barely moves. */
  private drawSun(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const { sun } = this.backdrop;
    const x = sun.x - camX * 0.02;
    const y = sun.y + camY * 0.05;

    ctx.fillStyle = sun.glow;
    ctx.beginPath();
    ctx.arc(x, y, sun.radius * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sun.colour;
    ctx.beginPath();
    ctx.arc(x, y, sun.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Snow, blossom or spray. Positions come from an index rather than stored
   * particles, so there is nothing to allocate or update per frame.
   */
  private drawFlecks(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const flecks = this.backdrop.flecks;
    if (!flecks) return;

    const field = VIRTUAL_WIDTH * FLECK_FIELD;
    ctx.fillStyle = flecks.colour;
    for (let i = 0; i < flecks.count; i++) {
      const speed = 0.4 + (i % 5) * 0.16;
      const fall = this.weatherTick * flecks.drift * speed;
      const sway = Math.sin((this.weatherTick / 40) + i) * 6;

      const x = mod(i * 137.5 - camX * 0.35 + sway, field) - VIRTUAL_WIDTH;
      const y = mod(i * 71.3 + fall - camY * 0.35, VIRTUAL_HEIGHT + 40) - 20;
      const size = i % 3 === 0 ? 2 : 1;
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
  }

  private drawTiles(
    ctx: CanvasRenderingContext2D,
    session: Session,
    camX: number,
    camY: number,
  ): void {
    const map = session.level.map;
    // Only the tiles actually on screen, plus one for the partial edges.
    const firstX = Math.max(0, Math.floor(camX / TILE));
    const lastX = Math.min(map.width - 1, Math.ceil((camX + VIRTUAL_WIDTH) / TILE));
    const firstY = Math.max(0, Math.floor(camY / TILE));
    const lastY = Math.min(map.height - 1, Math.ceil((camY + VIRTUAL_HEIGHT) / TILE));

    for (let ty = firstY; ty <= lastY; ty++) {
      for (let tx = firstX; tx <= lastX; tx++) {
        const id = map.tiles[ty * map.width + tx];
        if (!id) continue;

        // Anything solid overhead buries this tile, so it gets no grass cap.
        // Testing only for full blocks left a green step poking out from under
        // every ramp, where the ramp is thin enough to show the tile beneath.
        // One-way platforms are excluded: you can see the ground under them.
        const above = ty > 0 ? map.tiles[(ty - 1) * map.width + tx] : 0;
        const buried = above && above !== ONE_WAY_SHAPE ? 1 : 0;

        ctx.drawImage(
          this.tileset,
          id * TILE,
          buried * TILE,
          TILE,
          TILE,
          tx * TILE - camX,
          ty * TILE - camY,
          TILE,
          TILE,
        );
      }
    }
  }

  /**
   * The chasing wall: everything left of it is death. Drawn behind the
   * entities so bones and enemies stay readable as it swallows them.
   */
  private drawChase(
    ctx: CanvasRenderingContext2D,
    session: Session,
    camX: number,
    camY: number,
  ): void {
    if (session.chaseX === null) return;
    const edgeX = Math.round(session.chaseX - camX);
    if (edgeX < -40) return;

    const { body, edge } = this.theme.chase;
    const top = -camY;

    ctx.fillStyle = body;
    ctx.fillRect(-VIRTUAL_WIDTH, top, edgeX + VIRTUAL_WIDTH, VIRTUAL_HEIGHT * 2);

    // A churning leading edge, so it reads as moving rather than as a wall.
    ctx.fillStyle = edge;
    const t = session.body.x + session.entities.length; // any steadily changing value
    for (let y = top; y < VIRTUAL_HEIGHT + 40; y += 12) {
      const wobble = Math.sin((y + t) / 9) * 4;
      ctx.beginPath();
      ctx.arc(edgeX + wobble, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(edgeX - 6, top, 4, VIRTUAL_HEIGHT * 2);
  }

  private drawEntities(
    ctx: CanvasRenderingContext2D,
    session: Session,
    camX: number,
    camY: number,
  ): void {
    for (const entity of session.entities) {
      if (entity.taken) continue;
      const x = entity.x - camX;
      const y = entity.y - camY;
      if (x < -48 || x > VIRTUAL_WIDTH + 48) continue; // off screen
      this.drawEntity(ctx, entity, x, y);
    }
  }

  private drawEntity(ctx: CanvasRenderingContext2D, entity: Entity, x: number, y: number): void {
    switch (entity.kind) {
      case 'bone':
        // A gentle bob makes a static pickup feel alive.
        this.sprites.drawPropCentred(ctx, 'bone', x, y + Math.sin(entity.t / 18) * 2);
        break;
      case 'spring':
        this.sprites.drawProp(ctx, entity.t < 12 ? 'springUp' : 'spring', x, y + 8);
        break;
      case 'springLeft':
      case 'springRight':
        this.sprites.drawPropCentred(
          ctx,
          entity.t < 12 ? 'springUp' : 'spring',
          x,
          y,
          entity.kind === 'springLeft',
        );
        break;
      case 'boost':
        this.drawBoostPad(ctx, entity, x, y);
        break;
      case 'spike':
        this.sprites.drawProp(ctx, 'spike', x, y + 5);
        break;
      case 'star':
        // Bobs and turns on the spot so it catches the eye as something rarer
        // than a bone.
        this.sprites.drawPropCentred(
          ctx,
          'star',
          x,
          y + Math.sin(entity.t / 14) * 3,
          Math.floor(entity.t / 20) % 2 === 0,
        );
        break;
      case 'crate':
        this.sprites.drawPropCentred(ctx, 'crate', x, y);
        break;
      case 'checkpoint':
        this.sprites.drawProp(ctx, entity.triggered ? 'checkpointLit' : 'checkpoint', x, y + 15);
        break;
      case 'goal':
        // Drawn at the kennel's own size; its trigger box is far taller.
        this.sprites.drawProp(ctx, 'goal', x, y + GOAL_ART_HALF_HEIGHT);
        break;
      case 'walker':
        // The duck art faces right, so it is mirrored when heading left.
        this.sprites.drawPropCentred(
          ctx,
          Math.floor(entity.t / 12) % 2 === 0 ? 'walkerA' : 'walkerB',
          x,
          y,
          entity.facing === -1,
        );
        break;
      case 'flyer':
        this.sprites.drawPropCentred(
          ctx,
          Math.floor(entity.t / 8) % 2 === 0 ? 'flyerA' : 'flyerB',
          x,
          y,
          entity.facing === -1,
        );
        break;
      case 'pigeon':
        // Slower wingbeat than the ducks, to match its steadier flight.
        this.sprites.drawPropCentred(
          ctx,
          Math.floor(entity.t / 11) % 2 === 0 ? 'pigeonA' : 'pigeonB',
          x,
          y,
          entity.facing === -1,
        );
        break;
      case 'falcon':
        this.drawFalcon(ctx, entity, x, y);
        break;
      case 'platformH':
      case 'platformV':
        this.drawPlatform(ctx, x, y);
        break;
    }
  }

  /**
   * A falcon shows its intent: it switches to the swept-back stoop pose the
   * moment the wind-up starts, and flashes through it. That telegraph is the
   * only warning the player gets, so it has to be unmissable.
   */
  private drawFalcon(
    ctx: CanvasRenderingContext2D,
    entity: Entity,
    x: number,
    y: number,
  ): void {
    const committed = entity.diving || entity.windup > 0;
    if (entity.windup > 0 && Math.floor(entity.windup / 4) % 2 === 0) {
      ctx.globalAlpha = 0.65;
    }
    this.sprites.drawPropCentred(
      ctx,
      committed ? 'falconB' : 'falconA',
      x,
      y,
      entity.facing === -1,
    );
    ctx.globalAlpha = 1;
  }

  private drawBoostPad(ctx: CanvasRenderingContext2D, entity: Entity, x: number, y: number): void {
    ctx.fillStyle = this.theme.accent;
    ctx.fillRect(Math.round(x - 8), Math.round(y + 4), 16, 4);
    // Chevrons that slide along, so it reads as "this way, fast".
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const offset = ((entity.t / 3 + i * 6) % 18) - 9;
      ctx.fillRect(Math.round(x + offset), Math.round(y + 5), 3, 2);
    }
  }

  private drawPlatform(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = this.theme.ground.deep;
    ctx.fillRect(Math.round(x - 24), Math.round(y - 6), 48, 12);
    ctx.fillStyle = this.theme.ground.top;
    ctx.fillRect(Math.round(x - 24), Math.round(y - 6), 48, 4);
  }

  private drawLooseBones(
    ctx: CanvasRenderingContext2D,
    session: Session,
    camX: number,
    camY: number,
  ): void {
    for (const bone of session.loose) {
      // Blink out over the last second, so a disappearing bone is not a surprise.
      if (bone.life < 60 && Math.floor(bone.life / 4) % 2 === 0) continue;
      this.sprites.drawPropCentred(ctx, 'bone', bone.x - camX, bone.y - camY);
    }
  }

  private drawRoxy(
    ctx: CanvasRenderingContext2D,
    session: Session,
    camX: number,
    camY: number,
  ): void {
    const body = session.body;
    const wanted = chooseAnimation(session);

    if (wanted !== this.animation) {
      this.animation = wanted;
      this.frame = 0;
      this.frameTimer = 0;
    }

    this.frameTimer += 1;
    if (this.frameTimer >= frameDelay(this.animation, body.gsp)) {
      this.frameTimer = 0;
      this.frame = (this.frame + 1) % this.sprites.frameCount(this.animation);
    }

    // Flicker through the mercy invulnerability, the usual signal that a hit
    // has just been taken and the next one is free.
    if (session.invulnerable > 0 && Math.floor(session.invulnerable / 4) % 2 === 0) return;

    const x = body.x - camX;
    const y = body.y - camY;

    if (session.invincible > 0) this.drawStarSparkles(ctx, session, x, y);

    // Lean into the slope while grounded; the sprite is drawn upright otherwise.
    if (body.grounded && Math.abs(body.angle) > 0.05 && !body.rolling) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(body.angle);
      this.sprites.drawRoxy(ctx, this.animation, this.frame, 0, 0, body.facing === -1);
      ctx.restore();
      return;
    }

    this.sprites.drawRoxy(ctx, this.animation, this.frame, x, y, body.facing === -1);
  }

  /**
   * Star power: sparkles orbiting Roxy, thinning out as it runs down so the
   * end is visible before it arrives rather than being a surprise.
   */
  private drawStarSparkles(
    ctx: CanvasRenderingContext2D,
    session: Session,
    x: number,
    y: number,
  ): void {
    const ending = session.invincible < 60;
    if (ending && Math.floor(session.invincible / 5) % 2 === 0) return;

    const spin = this.weatherTick / 6;
    for (let i = 0; i < 6; i++) {
      const angle = spin + (i * Math.PI * 2) / 6;
      const radius = 17 + Math.sin(this.weatherTick / 9 + i) * 3;
      const sx = Math.round(x + Math.cos(angle) * radius);
      const sy = Math.round(y + Math.sin(angle) * radius * 0.8);

      // A little cross rather than a dot: at 480x270 a two-pixel square is
      // easy to lose against busy scenery.
      ctx.fillStyle = i % 2 === 0 ? '#ffd633' : '#ffffff';
      ctx.fillRect(sx - 1, sy, 3, 1);
      ctx.fillRect(sx, sy - 1, 1, 3);
    }
  }

  private drawPopups(
    ctx: CanvasRenderingContext2D,
    session: Session,
    camX: number,
    camY: number,
  ): void {
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (const popup of session.popups) {
      const x = Math.round(popup.x - camX);
      const y = Math.round(popup.y - camY);
      ctx.fillStyle = '#000000';
      ctx.fillText(popup.text, x + 1, y + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(popup.text, x, y);
    }
    ctx.textAlign = 'left';
  }
}

/** Pick the animation that matches what Roxy is currently doing. */
function chooseAnimation(session: Session): RoxyAnimation {
  const body = session.body;
  if (session.state === 'dying' || session.state === 'gameOver') return 'hurt';
  if (session.state === 'complete') return 'victory';
  if (body.spindash !== null || body.rolling) return 'roll';
  if (!body.grounded) return 'jump';

  // Holding the opposite direction at speed is a skid, not a run.
  const braking = body.grounded && Math.abs(body.gsp) > 3 && Math.sign(body.gsp) !== body.facing;
  if (braking) return 'skid';

  const speed = Math.abs(body.gsp);
  if (speed > 3.5) return 'run';
  if (speed > 0.3) return 'walk';
  return 'idle';
}

/** Positive modulo, so wrapping works for negative camera offsets too. */
function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}
