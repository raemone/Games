/**
 * Fixed-timestep game loop.
 *
 * The physics constants are per-60Hz-frame values, so the simulation must run
 * at exactly 60Hz regardless of the display's refresh rate - otherwise Roxy
 * runs at double speed on a 120Hz tablet. Rendering still happens once per
 * animation frame, with an interpolation factor for smooth motion between ticks.
 */

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

/**
 * Never simulate more than this many ticks in one frame. Without it, a tab
 * restored after a minute in the background would try to catch up on thousands
 * of ticks at once and lock the browser.
 */
const MAX_CATCH_UP_TICKS = 5;

export interface LoopCallbacks {
  /** Advance the simulation by exactly one 60Hz tick. */
  update(): void;
  /** Draw. `alpha` is 0..1 between the last tick and the next. */
  render(alpha: number): void;
}

export class Loop {
  private accumulator = 0;
  /** null until the first animation frame supplies a timestamp. */
  private lastTime: number | null = null;
  private frame = 0;
  private running = false;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    // Deliberately not seeded from performance.now(): requestAnimationFrame is
    // not guaranteed to share that time origin, and in an embedded frame it
    // does not. Seeding from the wrong clock makes the first delta enormously
    // negative and the accumulator never recovers - the game renders but never
    // simulates. The first frame just sets the baseline instead.
    this.lastTime = null;
    this.accumulator = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);

    if (this.lastTime === null) {
      this.lastTime = now;
      this.callbacks.render(0);
      return;
    }

    const elapsed = now - this.lastTime;
    this.lastTime = now;

    // Clamped at both ends: a huge elapsed time means the tab was hidden, and
    // skipping it beats fast-forwarding the player into a pit they never saw.
    // A negative one means the clock moved backwards, which should never
    // happen but must not wedge the simulation if it does.
    this.accumulator += Math.max(0, Math.min(elapsed, TICK_MS * MAX_CATCH_UP_TICKS));

    let ticks = 0;
    while (this.accumulator >= TICK_MS && ticks < MAX_CATCH_UP_TICKS) {
      this.callbacks.update();
      this.accumulator -= TICK_MS;
      ticks++;
    }

    this.callbacks.render(this.accumulator / TICK_MS);
  };
}
