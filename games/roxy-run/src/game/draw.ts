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
import { buildBackdrop, buildTileset } from './terrain';
import type { Theme } from './theme';
import type { Entity } from './entities';
import type { PropName } from '../assets/generated/sprites';

const BACKDROP_WIDTH = 320;
const BACKDROP_HEIGHT = 120;
/** How much slower than the camera each parallax layer moves. */
const FAR_FACTOR = 0.25;
const NEAR_FACTOR = 0.5;
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
  private readonly backdrop: HTMLCanvasElement;
  private readonly sky: CanvasGradient;

  private animation: RoxyAnimation = 'idle';
  private frame = 0;
  private frameTimer = 0;

  constructor(
    private readonly theme: Theme,
    private readonly sprites: Sprites,
    ctx: CanvasRenderingContext2D,
  ) {
    this.tileset = buildTileset(theme).canvas;
    this.backdrop = buildBackdrop(theme, BACKDROP_WIDTH, BACKDROP_HEIGHT);

    this.sky = ctx.createLinearGradient(0, 0, 0, VIRTUAL_HEIGHT);
    this.sky.addColorStop(0, theme.sky[0]);
    this.sky.addColorStop(1, theme.sky[1]);
  }

  draw(ctx: CanvasRenderingContext2D, session: Session): void {
    const shake = session.camera.shakeOffset;
    const camX = Math.round(session.camera.x + shake.x);
    const camY = Math.round(session.camera.y + shake.y);

    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    this.drawParallax(ctx, camX, camY);
    this.drawTiles(ctx, session, camX, camY);
    this.drawEntities(ctx, session, camX, camY);
    this.drawLooseBones(ctx, session, camX, camY);
    this.drawRoxy(ctx, session, camX, camY);
    this.drawPopups(ctx, session, camX, camY);
  }

  private drawParallax(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const horizon = VIRTUAL_HEIGHT - BACKDROP_HEIGHT + Math.round(camY * 0.12);
    for (const factor of [FAR_FACTOR, NEAR_FACTOR]) {
      const offset = Math.round(camX * factor) % BACKDROP_WIDTH;
      const y = factor === FAR_FACTOR ? horizon - 18 : horizon;
      ctx.globalAlpha = factor === FAR_FACTOR ? 0.55 : 1;
      for (let x = -offset - BACKDROP_WIDTH; x < VIRTUAL_WIDTH; x += BACKDROP_WIDTH) {
        ctx.drawImage(this.backdrop, x, y);
      }
    }
    ctx.globalAlpha = 1;
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
    const world = this.theme.id;
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
        this.sprites.drawPropCentred(
          ctx,
          `walker${world}${Math.floor(entity.t / 12) % 2 === 0 ? 'a' : 'b'}` as PropName,
          x,
          y,
          entity.facing === 1,
        );
        break;
      case 'flyer':
        this.sprites.drawPropCentred(
          ctx,
          `flyer${world}${Math.floor(entity.t / 8) % 2 === 0 ? 'a' : 'b'}` as PropName,
          x,
          y,
          entity.facing === 1,
        );
        break;
      case 'platformH':
      case 'platformV':
        this.drawPlatform(ctx, x, y);
        break;
    }
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
