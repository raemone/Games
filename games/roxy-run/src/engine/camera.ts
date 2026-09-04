/**
 * A Sonic-style camera: a dead zone the player moves freely inside, a vertical
 * lag that keeps the horizon steady while running over bumps, and a look-ahead
 * that opens up the view in the direction of travel so there is time to react
 * at speed.
 */
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from './renderer';

const DEAD_ZONE_X = 16;
const DEAD_ZONE_Y = 32;
/** Max pixels the camera closes per frame; this is what creates the lag. */
const FOLLOW_X = 16;
const FOLLOW_Y = 6;
/** Vertical catch-up is faster while airborne so a big jump stays in frame. */
const FOLLOW_Y_AIR = 16;
const LOOK_AHEAD = 64;
const LOOK_AHEAD_SPEED = 1.5;

export class Camera {
  x = 0;
  y = 0;
  private lookAhead = 0;
  private shake = 0;

  constructor(
    private worldWidth: number,
    private worldHeight: number,
  ) {}

  setBounds(worldWidth: number, worldHeight: number): void {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  /** Jump straight to the target, e.g. on spawn or after a respawn. */
  snapTo(targetX: number, targetY: number): void {
    this.lookAhead = 0;
    this.x = targetX - VIRTUAL_WIDTH / 2;
    this.y = targetY - VIRTUAL_HEIGHT / 2;
    this.clamp();
  }

  /** Rattle the view - used when Roxy gets hit or something heavy lands. */
  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, 8);
  }

  follow(targetX: number, targetY: number, speedX: number, grounded: boolean): void {
    // Ease the look-ahead in and out so the view does not snap when turning.
    const wanted = Math.abs(speedX) > LOOK_AHEAD_SPEED ? Math.sign(speedX) * LOOK_AHEAD : 0;
    this.lookAhead += (wanted - this.lookAhead) * 0.05;

    const centreX = targetX + this.lookAhead - VIRTUAL_WIDTH / 2;
    const centreY = targetY - VIRTUAL_HEIGHT / 2;

    this.x += approach(this.x, centreX, DEAD_ZONE_X, FOLLOW_X);
    this.y += approach(this.y, centreY, DEAD_ZONE_Y, grounded ? FOLLOW_Y : FOLLOW_Y_AIR);

    if (this.shake > 0.1) {
      this.shake *= 0.85;
    } else {
      this.shake = 0;
    }

    this.clamp();
  }

  /** Current shake offset, applied at draw time rather than to x and y. */
  get shakeOffset(): { x: number; y: number } {
    if (this.shake === 0) return { x: 0, y: 0 };
    return {
      x: Math.round((Math.random() - 0.5) * this.shake * 2),
      y: Math.round((Math.random() - 0.5) * this.shake * 2),
    };
  }

  private clamp(): void {
    this.x = clamp(this.x, 0, Math.max(0, this.worldWidth - VIRTUAL_WIDTH));
    this.y = clamp(this.y, 0, Math.max(0, this.worldHeight - VIRTUAL_HEIGHT));
  }
}

/** Move toward `target`, ignoring a dead zone and capped at `maxStep`. */
function approach(current: number, target: number, deadZone: number, maxStep: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= deadZone) return 0;
  const beyond = delta - Math.sign(delta) * deadZone;
  return clamp(beyond, -maxStep, maxStep);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
