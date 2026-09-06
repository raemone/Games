/**
 * Fixed-timestep game loop.
 *
 * Every constant in `physics.ts` is a per-60Hz-frame value, so the simulation
 * must run at exactly 60Hz whatever the display does - otherwise the ball falls
 * at double speed on a 120Hz tablet and no flipper shot lands where it should.
 * Drawing still happens once per animation frame.
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
  render(): void;
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
    // negative and the accumulator never recovers - the table renders but never
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
      this.callbacks.render();
      return;
    }

    const elapsed = now - this.lastTime;
    this.lastTime = now;

    // Clamped at both ends: a huge elapsed time means the tab was hidden, and
    // skipping it beats fast-forwarding a ball into the drain nobody saw. A
    // negative one means the clock moved backwards, which should never happen
    // but must not wedge the simulation if it does.
    this.accumulator += Math.max(0, Math.min(elapsed, TICK_MS * MAX_CATCH_UP_TICKS));

    let ticks = 0;
    while (this.accumulator >= TICK_MS && ticks < MAX_CATCH_UP_TICKS) {
      this.callbacks.update();
      this.accumulator -= TICK_MS;
      ticks++;
    }

    this.callbacks.render();
  };
}
