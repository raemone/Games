/**
 * One attempt at one level: Roxy, the entities, the camera and the run's score
 * all advancing together. Drawing lives in draw.ts - this file is only the
 * simulation, so it stays readable and does not need a canvas to reason about.
 */
import { Camera } from '../engine/camera';
import { findFloor } from './collision';
import type { Audio } from '../engine/audio';
import { type Body, type PhysicsInput, createBody, launch, setRolling, step } from './physics';
import { type Entity, boxOf, createEntities, isEnemy, overlaps, platformTop, updateEntity } from './entities';
import type { Level } from './level';
import { type Run, bopEnemy, collectBone, finishLevel, resetChain, respawn, takeHit } from './scoring';
import type { Theme } from './theme';

export type SessionState = 'playing' | 'dying' | 'complete' | 'timeUp' | 'gameOver';

/** Frames of mercy invulnerability after a hit. */
const INVULNERABLE_FRAMES = 110;
/** How long the death animation plays before respawning. */
const DYING_FRAMES = 100;
const SPRING_FORCE = 11;
const SIDE_SPRING_FORCE = 9;
const BOOST_SPEED = 9;
const BOP_BOUNCE = 6;
const HURT_KNOCKBACK = 3;
/** How far behind the player the chase starts, and restarts after a death. */
const CHASE_HEAD_START = 460;
/**
 * Ticks of grace before the chase starts moving. Together with the head start
 * this gives a player who freezes about six seconds - long enough to read the
 * warning and react, rather than being run over while working out what the
 * flashing text means.
 */
const CHASE_DELAY = 180;
/** How close the chase has to get before it catches you. */
const CHASE_REACH = 14;

/** A bone knocked loose by a hit. */
export interface LooseBone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks remaining before it vanishes. */
  life: number;
  /** Ticks before it can be picked back up, so it does not snap straight back. */
  cooldown: number;
}

/** A short-lived "+100" that floats up from where something was scored. */
export interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
}

export class Session {
  readonly body: Body;
  readonly camera: Camera;
  entities: Entity[];
  state: SessionState = 'playing';
  readonly loose: LooseBone[] = [];
  readonly popups: Popup[] = [];

  /** Ticks of invulnerability remaining. */
  invulnerable = 0;
  /** Counts down while dying, then respawns. */
  stateTimer = 0;
  /** Where a respawn puts Roxy - moved by checkpoints. */
  private checkpointX: number;
  private checkpointY: number;
  /** Frames since the level started, for the clock. */
  private ticks = 0;
  /** Set once, so the goal cannot be scored twice. */
  private finished = false;
  /**
   * World x of the thing chasing the player, or null on a level without one.
   * It is a moving left-hand wall rather than an entity: nothing about it
   * needs collision geometry, only a position and the rule that being behind
   * it hurts.
   */
  chaseX: number | null;

  constructor(
    readonly level: Level,
    readonly theme: Theme,
    readonly run: Run,
    private readonly audio: Audio,
  ) {
    this.body = createBody(level.spawn.x, level.spawn.y);
    this.entities = createEntities(level);
    this.camera = new Camera(level.pixelWidth, level.pixelHeight);
    this.camera.snapTo(this.body.x, this.body.y);
    this.checkpointX = level.spawn.x;
    this.checkpointY = level.spawn.y;
    this.chaseX = level.def.chase === undefined ? null : level.spawn.x - CHASE_HEAD_START;
  }

  /** True while the chase is close enough to be worth panicking about. */
  get chaseIsClose(): boolean {
    return this.chaseX !== null && this.body.x - this.chaseX < 220;
  }

  get timeLimitMs(): number {
    return this.level.def.timeLimit * 1000;
  }

  get remainingMs(): number {
    return Math.max(0, this.timeLimitMs - this.run.elapsedMs);
  }

  update(input: PhysicsInput): void {
    for (const entity of this.entities) updateEntity(entity, this.level.map);
    this.updateLooseBones();
    this.updatePopups();

    if (this.state === 'dying') {
      this.stateTimer -= 1;
      // Keep the body falling so the death has some weight to it.
      this.body.y += this.body.ysp;
      this.body.ysp += 0.3;
      if (this.stateTimer <= 0) this.afterDeath();
      return;
    }

    if (this.state !== 'playing') return;

    this.ticks += 1;
    this.run.elapsedMs = (this.ticks * 1000) / 60;
    if (this.invulnerable > 0) this.invulnerable -= 1;

    const wasGrounded = this.body.grounded;
    step(this.body, this.toPhysicsInput(input), this.level.map, this.theme.feel);

    // Landing ends an airborne combo chain.
    if (!wasGrounded && this.body.grounded) resetChain(this.run);

    this.ridePlatforms();
    this.collideEntities();
    this.updateChase();
    this.clampToLevel();

    this.camera.follow(this.body.x, this.body.y, this.body.gsp, this.body.grounded);

    if (this.run.elapsedMs >= this.timeLimitMs) this.timeUp();
  }

  private toPhysicsInput(input: PhysicsInput): PhysicsInput {
    // Control is taken away during the victory pose so Roxy runs off happily.
    if (this.state !== 'playing') {
      return { left: false, right: false, down: false, jumpHeld: false, jumpPressed: false };
    }
    return {
      left: input.left,
      right: input.right,
      down: input.down,
      jumpHeld: input.jumpHeld,
      jumpPressed: input.jumpPressed,
    };
  }

  /** Roxy's collision box, which shrinks when she rolls. */
  private playerBox() {
    return {
      x: this.body.x - this.body.widthRadius,
      y: this.body.y - this.body.heightRadius,
      w: this.body.widthRadius * 2,
      h: this.body.heightRadius * 2,
    };
  }

  /**
   * Moving platforms are handled here rather than in the tile collision,
   * because they are the only solids that move and the tile map is static.
   */
  private ridePlatforms(): void {
    if (this.body.ysp < 0) return;

    const feet = this.body.y + this.body.heightRadius;
    for (const entity of this.entities) {
      if (entity.kind !== 'platformH' && entity.kind !== 'platformV') continue;

      const box = boxOf(entity);
      const top = platformTop(entity);
      const withinX = this.body.x > box.x - 4 && this.body.x < box.x + box.w + 4;
      // A band rather than an exact test, so a fast fall still catches the top.
      const landing = feet >= top - 2 && feet <= top + Math.max(6, this.body.ysp + 4);
      if (!withinX || !landing) continue;

      this.body.y = top - this.body.heightRadius;
      if (!this.body.grounded) {
        this.body.grounded = true;
        this.body.jumping = false;
        this.body.gsp = this.body.xsp;
        this.body.angle = 0;
        resetChain(this.run);
      }
      this.body.ysp = 0;
      // Carry the rider along with the platform.
      if (entity.kind === 'platformH') {
        const previous = entity.homeX + Math.sin((entity.t - 1) * (0.8 / 60)) * 64;
        this.body.x += entity.x - previous;
      }
      return;
    }
  }

  private collideEntities(): void {
    const player = this.playerBox();

    for (const entity of this.entities) {
      if (entity.taken) continue;
      if (!overlaps(player, boxOf(entity))) continue;

      switch (entity.kind) {
        case 'bone':
          entity.taken = true;
          if (collectBone(this.run)) this.audio.play('extraLife');
          else this.audio.play('bone');
          break;

        case 'spring':
          entity.t = 0;
          launch(this.body, this.body.xsp, -SPRING_FORCE);
          this.audio.play('spring');
          break;

        case 'springLeft':
        case 'springRight': {
          entity.t = 0;
          const dir = entity.kind === 'springRight' ? 1 : -1;
          launch(this.body, SIDE_SPRING_FORCE * dir, -3);
          this.body.facing = dir === 1 ? 1 : -1;
          this.audio.play('spring');
          break;
        }

        case 'boost':
          // Boost pads always fire forward, so they cannot trap you facing back.
          this.body.gsp = BOOST_SPEED * (this.body.gsp < 0 ? -1 : 1);
          this.audio.play('spindash');
          break;

        case 'spike':
          this.hurt(entity.x);
          break;

        case 'crate':
          this.hitCrate(entity);
          break;

        case 'walker':
        case 'flyer':
          this.hitEnemy(entity);
          break;

        case 'checkpoint':
          if (!entity.triggered) {
            entity.triggered = true;
            this.checkpointX = entity.x;
            this.checkpointY = entity.y - 8;
            this.audio.play('checkpoint');
            this.addPopup(entity.x, entity.y - 30, 'CHECKPOINT');
          }
          break;

        case 'goal':
          this.reachGoal();
          break;

        default:
          break;
      }
    }
  }

  /** Rolling or falling onto a crate breaks it; walking into it does not. */
  private hitCrate(entity: Entity): void {
    const attacking = this.body.rolling || (!this.body.grounded && this.body.ysp > 0);
    if (!attacking) {
      // Solid: push Roxy back out the side she came in.
      const box = boxOf(entity);
      const fromLeft = this.body.x < entity.x;
      this.body.x = fromLeft
        ? box.x - this.body.widthRadius
        : box.x + box.w + this.body.widthRadius;
      this.body.gsp = 0;
      this.body.xsp = 0;
      return;
    }

    entity.taken = true;
    this.run.score += 50;
    this.addPopup(entity.x, entity.y - 12, '50');
    this.audio.play('bop');
    if (!this.body.grounded && this.body.ysp > 0) this.body.ysp = -BOP_BOUNCE * 0.7;
  }

  /** Bopping from above kills; anything else hurts. */
  private hitEnemy(entity: Entity): void {
    if (!isEnemy(entity.kind)) return;

    const fromAbove = !this.body.grounded && this.body.ysp > 0 && this.body.y < entity.y - 4;
    const attacking = fromAbove || this.body.rolling;

    if (!attacking) {
      this.hurt(entity.x);
      return;
    }

    entity.taken = true;
    const points = bopEnemy(this.run);
    this.addPopup(entity.x, entity.y - 16, String(points));
    this.audio.play('bop');
    this.camera.addShake(2);

    // A bounce off the enemy, so a chain of bops is possible.
    if (!this.body.rolling || !this.body.grounded) this.body.ysp = -BOP_BOUNCE;
    this.body.grounded = false;
  }

  private hurt(sourceX: number): void {
    if (this.invulnerable > 0 || this.state !== 'playing') return;

    const result = takeHit(this.run);
    this.camera.addShake(5);

    if (result.lostLife) {
      this.audio.play('hurt');
      this.die();
      return;
    }

    this.audio.play('hurt');
    this.invulnerable = INVULNERABLE_FRAMES;
    this.scatterBones(result.scattered);

    // Knock her back away from whatever hit her.
    const away = this.body.x < sourceX ? -1 : 1;
    launch(this.body, HURT_KNOCKBACK * away, -4);
  }

  private scatterBones(count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 2 + (i % 2) * 1.4;
      this.loose.push({
        x: this.body.x,
        y: this.body.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 300,
        cooldown: 40,
      });
    }
  }

  /** Advance the chasing wall and catch anyone who falls behind it. */
  private updateChase(): void {
    const speed = this.level.def.chase;
    if (speed === undefined || this.chaseX === null) return;
    if (this.ticks < CHASE_DELAY) return;

    this.chaseX += speed;

    // Never let it overrun the goal, or finishing becomes a coin flip.
    const goal = this.level.entities.find((entity) => entity.kind === 'goal');
    if (goal) this.chaseX = Math.min(this.chaseX, goal.x - 40);

    if (this.body.x - this.body.widthRadius > this.chaseX + CHASE_REACH) return;

    // Caught: take a hit and get shoved clear, so the same tick cannot catch
    // you again the moment the invulnerability ends.
    if (this.invulnerable > 0) return;
    this.hurt(this.chaseX);
    this.body.x = this.chaseX + CHASE_REACH + this.body.widthRadius + 24;
  }

  private updateLooseBones(): void {
    const player = this.playerBox();

    for (let i = this.loose.length - 1; i >= 0; i--) {
      const bone = this.loose[i]!;
      bone.life -= 1;
      if (bone.cooldown > 0) bone.cooldown -= 1;

      bone.vy += 0.22;
      bone.x += bone.vx;
      bone.y += bone.vy;

      // A cheap bounce: probe straight down rather than running full collision.
      const below = bone.vy > 0 ? findFloor(this.level.map, bone.x, bone.y, 24) : null;
      if (below && bone.y > below.y - 6) {
        bone.y = below.y - 6;
        bone.vy *= -0.6;
        bone.vx *= 0.8;
        if (Math.abs(bone.vy) < 0.6) bone.vy = 0;
      }

      const collectable =
        bone.cooldown === 0 &&
        Math.abs(bone.x - this.body.x) < player.w / 2 + 8 &&
        Math.abs(bone.y - this.body.y) < player.h / 2 + 8;

      if (collectable) {
        if (collectBone(this.run)) this.audio.play('extraLife');
        else this.audio.play('bone');
        this.loose.splice(i, 1);
        continue;
      }

      if (bone.life <= 0) this.loose.splice(i, 1);
    }
  }

  private updatePopups(): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const popup = this.popups[i]!;
      popup.life -= 1;
      popup.y -= 0.4;
      if (popup.life <= 0) this.popups.splice(i, 1);
    }
  }

  private addPopup(x: number, y: number, text: string): void {
    this.popups.push({ x, y, text, life: 60 });
  }

  /** Keep Roxy inside the level, and treat the bottom edge as a pit. */
  private clampToLevel(): void {
    const minX = this.body.widthRadius;
    const maxX = this.level.pixelWidth - this.body.widthRadius;
    if (this.body.x < minX) {
      this.body.x = minX;
      if (this.body.gsp < 0) this.body.gsp = 0;
      if (this.body.xsp < 0) this.body.xsp = 0;
    } else if (this.body.x > maxX) {
      this.body.x = maxX;
      if (this.body.gsp > 0) this.body.gsp = 0;
      if (this.body.xsp > 0) this.body.xsp = 0;
    }

    if (this.body.y > this.level.pixelHeight + 40) {
      // A pit always costs a life, however many bones are in hand.
      this.run.bones = 0;
      this.run.lives -= 1;
      this.audio.play('hurt');
      this.die();
    }
  }

  private die(): void {
    this.state = 'dying';
    this.stateTimer = DYING_FRAMES;
    this.body.grounded = false;
    this.body.ysp = -6;
    this.body.xsp = 0;
    this.body.gsp = 0;
    setRolling(this.body, false);
  }

  private afterDeath(): void {
    if (this.run.lives <= 0) {
      this.state = 'gameOver';
      return;
    }
    this.state = 'playing';
    respawn(this.run);
    this.invulnerable = INVULNERABLE_FRAMES / 2;
    this.body.x = this.checkpointX;
    this.body.y = this.checkpointY;
    this.body.gsp = 0;
    this.body.xsp = 0;
    this.body.ysp = 0;
    this.body.grounded = false;
    this.body.angle = 0;
    this.camera.snapTo(this.body.x, this.body.y);
    this.loose.length = 0;
    if (this.chaseX !== null) this.chaseX = this.checkpointX - CHASE_HEAD_START;
  }

  private timeUp(): void {
    if (this.state !== 'playing') return;
    this.run.lives -= 1;
    this.state = this.run.lives <= 0 ? 'gameOver' : 'timeUp';
    this.audio.play('hurt');
  }

  private reachGoal(): void {
    if (this.finished) return;
    this.finished = true;
    this.state = 'complete';
    finishLevel(this.run, this.timeLimitMs);
    this.audio.play('goal');
  }

  /** Restart the current level from the beginning, keeping the run's score. */
  restart(): void {
    this.state = 'playing';
    this.finished = false;
    this.ticks = 0;
    this.run.elapsedMs = 0;
    this.entities = createEntities(this.level);
    this.loose.length = 0;
    this.popups.length = 0;
    this.checkpointX = this.level.spawn.x;
    this.checkpointY = this.level.spawn.y;
    this.chaseX =
      this.level.def.chase === undefined ? null : this.level.spawn.x - CHASE_HEAD_START;
    respawn(this.run);
    this.body.x = this.level.spawn.x;
    this.body.y = this.level.spawn.y;
    this.body.gsp = 0;
    this.body.xsp = 0;
    this.body.ysp = 0;
    this.body.grounded = false;
    this.body.angle = 0;
    setRolling(this.body, false);
    this.camera.snapTo(this.body.x, this.body.y);
  }
}
