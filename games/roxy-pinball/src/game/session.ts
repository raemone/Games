/**
 * One game of pinball: three balls, the rules that sit on top of the table, and
 * the bookkeeping that turns a physics collision into points and noise.
 *
 * `physics.ts` knows only that something with an id was hit. `missions.ts` and
 * `scoring.ts` know only the name of a shot. This is the piece in the middle,
 * and it is the only piece that needs a clock, a sound card or a random number.
 */
import type { Audio, Sfx } from '../engine/audio';
import type { InputState } from '../engine/input';
import type { Ball, Collider, Flipper, Hit, World } from './physics';
import { makeBall, makeFlipper, nudge, step } from './physics';
import type { MissionState, Shot } from './missions';
import {
  endMission,
  initialMissions,
  applyShot,
  cycleSelection,
  missionById,
  startSelected,
  tickMissions,
} from './missions';
import type { ScoreState } from './scoring';
import { AWARDS, BONES, award, collectBonus, earnedExtraBall, grantExtraBall, initialScore, rolloverLane } from './scoring';
import type { LaneLetter } from './scoring';
import {
  DRAIN_Y,
  DROP_TARGETS,
  FLIPPER_ACTIVE_ANGLE,
  FLIPPER_LEFT_PIVOT,
  FLIPPER_LENGTH,
  FLIPPER_REST_ANGLE,
  FLIPPER_RIGHT_PIVOT,
  HABITRAIL_RIGHT_EXIT,
  PLUNGER_MAX_SPEED,
  PLUNGER_MIN_SPEED,
  PLUNGER_REST,
  staticColliders,
  standingDropTargets,
  tableTriggers,
} from './table';

export const BALLS_PER_GAME = 3;

/** Long enough that a first ball is never over in four seconds. */
const BALL_SAVE_TICKS = 12 * 60;
const SKILL_SHOT_TICKS = 6 * 60;
/** How long the doghouse keeps the ball before feeding it back. */
const SAUCER_HOLD_TICKS = 70;
const PLUNGER_CHARGE_TICKS = 45;
/** A ball nobody launches eventually launches itself, so nothing can wedge. */
const AUTO_PLUNGE_TICKS = 10 * 60;
/** An orbit only counts if the ball ran the whole lane, not just the mouth. */
const ORBIT_WINDOW_TICKS = 110;
const TILT_LIMIT = 4;
const TILT_DECAY_TICKS = 200;
const DROP_RESET_TICKS = 45;

export type Phase = 'ready' | 'playing' | 'ballOver' | 'gameOver';

export interface Flash {
  x: number;
  y: number;
  life: number;
  readonly max: number;
  readonly hue: string;
}

export interface Banner {
  readonly text: string;
  /** The smaller line under it. Empty for a one-line banner. */
  readonly detail: string;
  ticks: number;
}

interface PlayBall {
  readonly ball: Ball;
  /** The last orbit-lane mouth this ball passed, for spotting a full lap. */
  lane: { readonly id: string; readonly tick: number } | null;
}

export class Session {
  phase: Phase = 'ready';
  score: ScoreState = initialScore();
  missions: MissionState = initialMissions();

  ballNumber = 1;
  ballsLeft = BALLS_PER_GAME;
  tilted = false;

  readonly flippers: readonly Flipper[];
  /** Which of the four bath brushes are knocked down. */
  dropsDown: boolean[] = [false, false, false, false];
  squirrelHits = 0;
  plungerCharge = 0;
  ballSaveTicks = 0;
  skillShotTicks = 0;
  /** The ball sitting in the doghouse, if any, and how long it has left there. */
  saucer: { ball: PlayBall; ticks: number } | null = null;
  flashes: Flash[] = [];
  banner: Banner | null = null;
  /** Set for a few seconds after the last ball, so the screen can say so. */
  gameOverTicks = 0;

  private balls: PlayBall[] = [];
  private world: World;
  private colliders: Collider[];
  private readonly statics: Collider[];
  private tick = 0;
  private tiltCharge = 0;
  private tiltDecay = 0;
  private dropResetTicks = 0;
  private idleTicks = 0;
  private multiballQueue = 0;
  private multiballDelay = 0;

  constructor(private readonly audio: Audio) {
    this.flippers = [
      makeFlipper(FLIPPER_LEFT_PIVOT, FLIPPER_LENGTH, FLIPPER_REST_ANGLE, FLIPPER_ACTIVE_ANGLE),
      makeFlipper(
        FLIPPER_RIGHT_PIVOT,
        FLIPPER_LENGTH,
        Math.PI - FLIPPER_REST_ANGLE,
        Math.PI - FLIPPER_ACTIVE_ANGLE,
      ),
    ];
    this.statics = staticColliders();
    this.colliders = [...this.statics, ...standingDropTargets(this.dropsDown)];
    this.world = {
      colliders: this.colliders,
      triggers: tableTriggers(),
      flippers: this.flippers,
      balls: [],
    };
    this.newBall();
  }

  /** Every ball currently on the playfield, for drawing. */
  get activeBalls(): readonly Ball[] {
    return this.world.balls;
  }

  get inMultiball(): boolean {
    return this.balls.length > 1;
  }

  get ballSaveLit(): boolean {
    return this.ballSaveTicks > 0;
  }

  get skillShotLit(): boolean {
    return this.skillShotTicks > 0;
  }

  /** The doghouse is lit whenever shooting it would do something interesting. */
  get doghouseLit(): boolean {
    return this.missions.active === null;
  }

  restart(): void {
    this.phase = 'ready';
    this.score = initialScore();
    this.missions = initialMissions();
    this.ballNumber = 1;
    this.ballsLeft = BALLS_PER_GAME;
    this.tilted = false;
    this.tiltCharge = 0;
    this.squirrelHits = 0;
    this.dropsDown = [false, false, false, false];
    this.rebuildColliders();
    this.flashes = [];
    this.banner = null;
    this.gameOverTicks = 0;
    this.saucer = null;
    this.balls = [];
    this.world.balls.length = 0;
    this.newBall();
  }

  private announce(text: string, detail = '', seconds = 2.4): void {
    this.banner = { text, detail, ticks: Math.round(seconds * 60) };
  }

  update(input: InputState): void {
    this.tick++;

    this.flippers[0]!.held = input.leftFlipper && !this.tilted;
    this.flippers[1]!.held = input.rightFlipper && !this.tilted;

    this.updatePlunger(input);
    this.updateNudge(input);

    const hits = step(this.world);
    if (!this.tilted) {
      for (const hit of hits) this.resolveHit(hit);
    } else {
      for (const hit of hits) {
        if (hit.kind !== 'trigger') this.playHitSound(hit);
      }
    }

    this.updateSaucer();
    this.updateTimers();
    this.checkDrains();
    this.updateFlashes();
  }

  // ---------------------------------------------------------------- plunger

  private updatePlunger(input: InputState): void {
    const waiting = this.ballInLane();
    if (!waiting) {
      this.plungerCharge = 0;
      this.idleTicks = 0;
      return;
    }

    this.idleTicks++;
    if (input.plungerHeld) {
      this.plungerCharge = Math.min(1, this.plungerCharge + 1 / PLUNGER_CHARGE_TICKS);
      return;
    }
    if (input.plungerReleased && this.plungerCharge > 0.02) {
      this.launch(waiting, this.plungerCharge);
      return;
    }
    // Nobody has touched it in ten seconds. Send it, or the game sits for ever.
    if (this.idleTicks > AUTO_PLUNGE_TICKS) this.launch(waiting, 0.62);
  }

  private ballInLane(): PlayBall | null {
    for (const play of this.balls) {
      if (play.ball.x > 334 && play.ball.y > 480 && Math.abs(play.ball.vy) < 0.4) return play;
    }
    return null;
  }

  private launch(play: PlayBall, power: number): void {
    const speed = PLUNGER_MIN_SPEED + (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED) * power;
    play.ball.vy = -speed;
    play.ball.vx = 0;
    this.plungerCharge = 0;
    this.idleTicks = 0;
    this.audio.play('launch', power);
    if (this.phase === 'ready') {
      this.phase = 'playing';
      this.skillShotTicks = SKILL_SHOT_TICKS;
      this.announce('SHOOT THE DOGHOUSE', 'Skill shot lit', 2.6);
    }
  }

  // ------------------------------------------------------------------ nudge

  private updateNudge(input: InputState): void {
    if (this.tilted || this.phase !== 'playing') return;
    let dx = 0;
    let dy = 0;
    if (input.nudgeLeft) dx -= 1.9;
    if (input.nudgeRight) dx += 1.9;
    if (input.nudgeUp) dy -= 1.7;
    if (dx === 0 && dy === 0) return;

    nudge(this.world.balls, dx, dy);
    this.tiltCharge++;
    this.tiltDecay = TILT_DECAY_TICKS;
    if (this.tiltCharge >= TILT_LIMIT) {
      this.tilted = true;
      this.audio.play('tilt');
      this.announce('TILT', 'Roxy is not impressed', 3);
    } else if (this.tiltCharge >= TILT_LIMIT - 1) {
      this.announce('CAREFUL', 'One more shove and it tilts', 1.6);
    }
  }

  // ------------------------------------------------------------------- hits

  private resolveHit(hit: Hit): void {
    this.playHitSound(hit);

    switch (hit.kind) {
      case 'post':
        if (hit.id.startsWith('bumper')) {
          this.score = award(this.score, AWARDS.bumper, BONES.bumper);
          this.pop(hit, '#ffd88a');
          this.feedMission('bumper');
        }
        return;
      case 'wall':
        if (hit.id.startsWith('drop-')) this.hitDropTarget(hit);
        else if (hit.id === 'squirrel') this.hitSquirrel(hit);
        else if (hit.id.startsWith('sling-')) {
          this.score = award(this.score, AWARDS.slingshot);
          this.pop(hit, '#ff9ec4');
        }
        return;
      case 'trigger':
        this.hitTrigger(hit);
        return;
      case 'flipper':
        return;
    }
  }

  private playHitSound(hit: Hit): void {
    const loud = Math.min(1, hit.speed / 9);
    if (hit.kind === 'flipper') {
      // A flipper that only nudged the ball it was already holding is silent.
      if (hit.speed > 1.5) this.audio.play('flipper', loud);
      return;
    }

    const byName: Partial<Record<string, Sfx>> = {
      squirrel: 'target',
      spinner: 'spinner',
      doghouse: 'saucer',
    };
    const named = byName[hit.id];
    if (named) this.audio.play(named, loud);
    else if (hit.id.startsWith('bumper')) this.audio.play('bumper', loud);
    else if (hit.id.startsWith('sling-')) this.audio.play('sling', loud);
    else if (hit.id.startsWith('drop-')) this.audio.play('drop');
    else if (hit.id.startsWith('lane-')) this.audio.play('lane');
  }

  private hitDropTarget(hit: Hit): void {
    const index = DROP_TARGETS.findIndex((spec) => spec.id === hit.id);
    if (index < 0 || this.dropsDown[index]) return;
    this.dropsDown[index] = true;
    this.rebuildColliders();
    this.score = award(this.score, AWARDS.drop, BONES.drop);
    this.pop(hit, '#8fd6ff');
    this.feedMission('drop');

    if (this.dropsDown.every(Boolean)) {
      this.score = award(this.score, AWARDS.dropBank);
      this.audio.play('dropBank');
      this.announce('BATH DODGED', 'All four brushes down');
      this.dropResetTicks = DROP_RESET_TICKS;
      this.feedMission('drop-bank');
    }
  }

  private hitSquirrel(hit: Hit): void {
    this.squirrelHits++;
    this.score = award(this.score, AWARDS.squirrel, BONES.squirrel);
    this.pop(hit, '#ffb46b');
    this.feedMission('squirrel');
    if (this.squirrelHits % 5 === 0) {
      this.score = award(this.score, AWARDS.squirrel * 10);
      this.audio.play('bark');
      this.announce('SQUIRREL!', 'Off the fence and gone');
    }
  }

  private hitTrigger(hit: Hit): void {
    const play = this.balls[hit.ball];
    if (!play) return;

    if (hit.id.startsWith('lane-')) {
      const letter = hit.id.slice(5) as LaneLetter;
      const result = rolloverLane(this.score, letter);
      this.score = result.state;
      this.pop(hit, '#a6f0c6');
      if (result.completedSet) {
        this.audio.play('laneSet');
        this.announce('R-O-X-Y', `Bonus x${this.score.multiplier}`);
      }
      this.feedMission(hit.id as Shot);
      return;
    }

    switch (hit.id) {
      case 'spinner':
        this.score = award(this.score, AWARDS.spinner, BONES.spinner);
        this.feedMission('spinner');
        return;
      case 'doghouse':
        this.enterSaucer(play);
        return;
      case 'orbit-left-bottom':
      case 'orbit-left-top':
      case 'orbit-right-bottom':
      case 'orbit-right-top':
        this.trackOrbit(play, hit.id);
        return;
      default:
        // Inlanes and outlanes: no points, but they are what a real table uses
        // to notice the ball is on its way back, so the ball save can be armed.
        return;
    }
  }

  /**
   * An orbit counts only when the ball runs the whole lane, mouth to mouth,
   * within a couple of seconds. Rattling into the lane mouth and falling back
   * out is not a lap, and paying for it would make the mission trivial.
   */
  private trackOrbit(play: PlayBall, id: string): void {
    const side = id.startsWith('orbit-left') ? 'left' : 'right';
    const previous = play.lane;
    play.lane = { id, tick: this.tick };
    if (!previous) return;
    if (this.tick - previous.tick > ORBIT_WINDOW_TICKS) return;
    if (!previous.id.startsWith(`orbit-${side}`)) return;
    if (previous.id === id) return;

    play.lane = null;
    this.score = award(this.score, AWARDS.orbit, BONES.orbit);
    this.audio.play('lane');
    this.feedMission(side === 'left' ? 'orbit-left' : 'orbit-right');
  }

  // ----------------------------------------------------------------- saucer

  private enterSaucer(play: PlayBall): void {
    if (this.saucer) return;
    const index = this.balls.indexOf(play);
    if (index < 0) return;
    this.balls.splice(index, 1);
    this.syncBalls();
    play.ball.vx = 0;
    play.ball.vy = 0;
    this.saucer = { ball: play, ticks: SAUCER_HOLD_TICKS };

    if (this.skillShotTicks > 0) {
      this.skillShotTicks = 0;
      this.score = award(this.score, AWARDS.skillShot, BONES.doghouse);
      this.audio.play('jackpot');
      this.announce('SKILL SHOT', 'Straight to the doghouse');
      return;
    }

    this.score = award(this.score, AWARDS.doghouse, BONES.doghouse);
    if (this.missions.active) {
      this.feedMission('doghouse');
      return;
    }
    if (this.missions.wizardLit) {
      this.startWizard();
      return;
    }
    this.beginMission();
  }

  private beginMission(): void {
    const definition = missionById(this.missions.selected);
    this.missions = startSelected(this.missions);
    this.audio.play('missionStart');
    this.announce(definition.name.toUpperCase(), definition.blurb, 3.4);
  }

  private startWizard(): void {
    this.missions = { ...this.missions, wizardLit: false };
    this.multiballQueue = 2;
    this.multiballDelay = 40;
    this.audio.play('jackpot');
    this.announce('BEST IN SHOW', 'Three balls. Everything is lit.', 4);
  }

  private updateSaucer(): void {
    if (!this.saucer) return;
    this.saucer.ticks--;
    if (this.saucer.ticks > 0) return;

    const play = this.saucer.ball;
    this.saucer = null;
    // Fed to the right inlane rather than spat back down the middle: a saucer
    // that dumps the ball into the drain is a saucer nobody shoots twice.
    play.ball.x = HABITRAIL_RIGHT_EXIT.x;
    play.ball.y = HABITRAIL_RIGHT_EXIT.y;
    play.ball.vx = -0.6;
    play.ball.vy = 2.4;
    play.ball.inside.clear();
    play.lane = null;
    this.balls.push(play);
    this.syncBalls();
  }

  // --------------------------------------------------------------- missions

  private feedMission(shot: Shot): void {
    const result = applyShot(this.missions, shot);
    this.missions = result.state;
    if (!result.advanced) return;

    this.score = award(this.score, result.points, BONES.missionShot);
    if (result.completed) {
      const definition = missionById(result.completed);
      this.audio.play('missionDone');
      this.announce(`${definition.name.toUpperCase()} DONE`, 'Good dog', 3);
      this.checkExtraBall();
      if (result.allComplete) {
        this.announce('BEST IN SHOW IS LIT', 'Shoot the doghouse', 3.6);
      }
      return;
    }
    this.audio.play('missionShot');
  }

  private checkExtraBall(): void {
    if (!earnedExtraBall(this.score, this.missions.completed.length)) return;
    this.score = grantExtraBall(this.score);
    this.ballsLeft++;
    this.audio.play('extraBall');
    this.announce('EXTRA BALL', 'One more go');
  }

  // ---------------------------------------------------------------- ticking

  private updateTimers(): void {
    if (this.ballSaveTicks > 0) this.ballSaveTicks--;
    if (this.skillShotTicks > 0) this.skillShotTicks--;
    if (this.gameOverTicks > 0) this.gameOverTicks--;

    if (this.banner) {
      this.banner.ticks--;
      if (this.banner.ticks <= 0) this.banner = null;
    }

    if (this.tiltDecay > 0) {
      this.tiltDecay--;
      if (this.tiltDecay === 0 && this.tiltCharge > 0) {
        this.tiltCharge--;
        if (this.tiltCharge > 0) this.tiltDecay = TILT_DECAY_TICKS;
      }
    }

    if (this.dropResetTicks > 0) {
      this.dropResetTicks--;
      if (this.dropResetTicks === 0) {
        this.dropsDown = [false, false, false, false];
        this.rebuildColliders();
      }
    }

    if (this.multiballDelay > 0) {
      this.multiballDelay--;
      if (this.multiballDelay === 0 && this.multiballQueue > 0) {
        this.multiballQueue--;
        this.addBall(true);
        this.multiballDelay = this.multiballQueue > 0 ? 45 : 0;
      }
    }

    if (this.phase !== 'playing') return;
    const ticked = tickMissions(this.missions);
    this.missions = ticked.state;
    if (ticked.timedOut) {
      const definition = missionById(ticked.timedOut);
      this.missions = cycleSelection(this.missions);
      this.announce('TIME', `${definition.name} will keep`, 2.4);
    }
  }

  private updateFlashes(): void {
    for (const flash of this.flashes) flash.life--;
    this.flashes = this.flashes.filter((flash) => flash.life > 0);
  }

  private pop(hit: Hit, hue: string): void {
    // A cap, because a ball rattling in the bumpers can raise a dozen a second
    // and every one of them costs a draw call.
    if (this.flashes.length > 24) this.flashes.shift();
    this.flashes.push({ x: hit.at.x, y: hit.at.y, life: 16, max: 16, hue });
  }

  // ------------------------------------------------------------------ balls

  private rebuildColliders(): void {
    this.colliders = [...this.statics, ...standingDropTargets(this.dropsDown)];
    this.world = { ...this.world, colliders: this.colliders };
  }

  private syncBalls(): void {
    this.world.balls.length = 0;
    for (const play of this.balls) this.world.balls.push(play.ball);
  }

  private newBall(): void {
    this.balls = [{ ball: makeBall(PLUNGER_REST.x, PLUNGER_REST.y), lane: null }];
    this.syncBalls();
    this.plungerCharge = 0;
    this.idleTicks = 0;
    this.ballSaveTicks = BALL_SAVE_TICKS;
    this.skillShotTicks = 0;
    this.squirrelHits = 0;
    this.dropsDown = [false, false, false, false];
    this.rebuildColliders();
    this.phase = 'ready';
  }

  /** Put another ball in the lane. `auto` sends it without waiting for a pull. */
  private addBall(auto: boolean): void {
    const play: PlayBall = { ball: makeBall(PLUNGER_REST.x, PLUNGER_REST.y), lane: null };
    this.balls.push(play);
    this.syncBalls();
    if (auto) this.launch(play, 0.95);
  }

  private checkDrains(): void {
    let drained = false;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const play = this.balls[i];
      if (!play || play.ball.y <= DRAIN_Y) continue;
      this.balls.splice(i, 1);
      drained = true;
    }
    if (!drained) return;
    this.syncBalls();

    if (this.balls.length > 0 || this.saucer) {
      // Still in multiball. Losing one ball of three is not losing a turn.
      this.audio.play('drain', 0.5);
      return;
    }

    if (this.ballSaveTicks > 0 && !this.tilted) {
      this.audio.play('bark');
      this.announce('BALL SAVED', 'Roxy fetched it back', 2);
      this.balls.push({ ball: makeBall(PLUNGER_REST.x, PLUNGER_REST.y), lane: null });
      this.syncBalls();
      // Nearly out of patience already, so the returned ball is sent within
      // half a second rather than making the player pull the plunger again.
      this.idleTicks = AUTO_PLUNGE_TICKS - 30;
      return;
    }

    this.endBall();
  }

  private endBall(): void {
    this.audio.play('drain');
    this.missions = endMission(this.missions);
    this.score = collectBonus(this.score);
    this.ballsLeft--;
    this.tilted = false;
    this.tiltCharge = 0;
    this.multiballQueue = 0;

    if (this.ballsLeft <= 0) {
      this.phase = 'gameOver';
      this.gameOverTicks = 3 * 60;
      this.announce('GAME OVER', 'Good dog', 4);
      return;
    }

    this.ballNumber++;
    this.newBall();
    this.announce(`BALL ${this.ballNumber}`, '', 1.8);
  }
}
