/**
 * One input state from three sources: keyboard, touch and gamepad.
 *
 * The flippers are the whole left and right halves of the playfield rather than
 * two little buttons. On a phone that is the difference between a game you can
 * play and one you can only poke at: a thumb landing anywhere on its own side
 * flips, so nobody has to look away from the ball to find a target.
 */
import type { Layout } from './renderer';

export interface InputState {
  readonly leftFlipper: boolean;
  readonly rightFlipper: boolean;
  readonly plungerHeld: boolean;
  /** True on the tick the plunger was let go. */
  readonly plungerReleased: boolean;
  readonly nudgeLeft: boolean;
  readonly nudgeRight: boolean;
  readonly nudgeUp: boolean;
  readonly pausePressed: boolean;
  /** A flipper, Enter, or a tap anywhere - for menus. */
  readonly confirmPressed: boolean;
}

export type ActionId =
  | 'left'
  | 'right'
  | 'plunge'
  | 'nudge-left'
  | 'nudge-right'
  | 'nudge-up'
  | 'pause'
  | 'confirm';

export interface BarButton {
  readonly id: ActionId;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const KEY_MAP: Readonly<Record<string, ActionId>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  KeyZ: 'left',
  ShiftLeft: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Slash: 'right',
  ShiftRight: 'right',
  Space: 'plunge',
  ArrowDown: 'plunge',
  KeyS: 'plunge',
  ArrowUp: 'nudge-up',
  KeyW: 'nudge-up',
  KeyQ: 'nudge-left',
  KeyE: 'nudge-right',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
};

/** Standard-gamepad button indices worth reading. */
const PAD_LEFT = [4, 6, 14];
const PAD_RIGHT = [5, 7, 15];
const PAD_PLUNGE = [0, 1, 2, 3];
const PAD_PAUSE = [9];

export class Input {
  /** True once the player has actually touched the screen. */
  touchActive = false;

  private readonly held = new Set<ActionId>();
  private readonly previous = new Set<ActionId>();
  /**
   * Anything that went down since the last sample, even if it was already
   * released again. Without this a tap shorter than one 60Hz tick is dropped
   * entirely - which is exactly what an excited child mashing a flipper makes.
   */
  private readonly pressedSinceSample = new Set<ActionId>();
  private readonly pointers = new Map<number, ActionId>();
  private buttons: BarButton[] = [];
  private tapped = false;
  private tapPoint: { x: number; y: number } | null = null;
  private layoutState: Layout | null = null;
  private readonly detach: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.listen(window, 'keydown', (event) => {
      const key = event as KeyboardEvent;
      const action = KEY_MAP[key.code];
      if (!action) return;
      // Stop the page scrolling under the table, and stop space clicking things.
      key.preventDefault();
      if (key.repeat) return;
      this.held.add(action);
      this.pressedSinceSample.add(action);
    });

    this.listen(window, 'keyup', (event) => {
      const action = KEY_MAP[(event as KeyboardEvent).code];
      if (action) this.held.delete(action);
    });

    // Releasing keys on blur avoids a flipper held up while the tab is hidden.
    this.listen(window, 'blur', () => this.releaseAll());

    this.listen(canvas, 'pointerdown', (event) => this.onPointerDown(event as PointerEvent));
    this.listen(canvas, 'pointermove', (event) => this.onPointerMove(event as PointerEvent));
    this.listen(canvas, 'pointerup', (event) => this.onPointerUp(event as PointerEvent));
    this.listen(canvas, 'pointercancel', (event) => this.onPointerUp(event as PointerEvent));
    this.listen(canvas, 'contextmenu', (event) => event.preventDefault());
  }

  private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    // Not passive: several of these call preventDefault.
    target.addEventListener(type, handler, { passive: false });
    this.detach.push(() => target.removeEventListener(type, handler));
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach.length = 0;
  }

  /** Recompute the button strip. Call whenever the window resizes. */
  layout(layout: Layout): void {
    this.layoutState = layout;
    const bottom = layout.height - layout.insets.bottom;
    const height = Math.max(44, layout.barHeight - layout.insets.bottom - 12);
    const y = bottom - height - 6;
    const margin = layout.contentLeft;
    const usable = layout.contentWidth;
    const gap = 8;
    const wide = Math.min(usable * 0.44, 220);
    const narrow = (usable - wide - gap * 2) / 2;

    this.buttons = [
      { id: 'nudge-left', label: 'NUDGE', x: margin, y, width: narrow, height },
      { id: 'plunge', label: 'PULL', x: margin + narrow + gap, y, width: wide, height },
      {
        id: 'nudge-right',
        label: 'NUDGE',
        x: margin + narrow + gap + wide + gap,
        y,
        width: narrow,
        height,
      },
    ];
  }

  get barButtons(): readonly BarButton[] {
    return this.buttons;
  }

  /** True while a finger is on that control, for drawing the pressed state. */
  isTouching(id: ActionId): boolean {
    for (const pressed of this.pointers.values()) {
      if (pressed === id) return true;
    }
    return false;
  }

  /**
   * Where the player last tapped, in screen pixels, or null if they have not
   * tapped since this was last read. Reading it consumes the tap, so a single
   * tap cannot activate two menu items.
   */
  takeTap(): { x: number; y: number } | null {
    const point = this.tapPoint;
    this.tapPoint = null;
    return point;
  }

  private hitTest(x: number, y: number): ActionId | null {
    for (const button of this.buttons) {
      if (
        x >= button.x &&
        x <= button.x + button.width &&
        y >= button.y &&
        y <= button.y + button.height
      ) {
        return button.id;
      }
    }
    const layout = this.layoutState;
    if (!layout) return null;
    // Anywhere between the score band and the button strip is a flipper, split
    // down the middle. The score band is excluded so that reaching for pause
    // does not also swing a flipper.
    if (y < layout.height - layout.barHeight && y > layout.hudHeight) {
      return x < layout.width / 2 ? 'left' : 'right';
    }
    return null;
  }

  private onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    // Only a real finger turns the on-screen hints on; a mouse click on a laptop
    // should not clutter the screen with buttons nobody needs.
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      this.touchActive = true;
    }
    this.tapped = true;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.tapPoint = { x, y };

    const action = this.hitTest(x, y);
    if (action) {
      this.pointers.set(event.pointerId, action);
      this.pressedSinceSample.add(action);
    }

    // Capture keeps a thumb that slides off a button still reporting moves, but
    // it throws for pointer ids the browser no longer recognises. It is a
    // nicety, so it goes last and its failure is ignored.
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* not capturable; the control still works, it just cannot be slid off */
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const action = this.hitTest(event.clientX - rect.left, event.clientY - rect.top);
    // A thumb that slides off its half must let the flipper go, or a player who
    // drifts towards the middle ends up holding both flippers up for ever.
    if (action) this.pointers.set(event.pointerId, action);
    else this.pointers.delete(event.pointerId);
  }

  private onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
  }

  private releaseAll(): void {
    this.held.clear();
    this.pointers.clear();
    this.pressedSinceSample.clear();
  }

  /**
   * Sample every source and fold it into one state.
   * Call exactly once per simulation tick - it is what advances edge detection.
   */
  sample(): InputState {
    const down = new Set(this.held);
    for (const action of this.pointers.values()) down.add(action);
    this.readGamepad(down);

    const isDown = (id: ActionId): boolean => down.has(id);
    /** Went down this tick, or went down and back up between ticks. */
    const justPressed = (id: ActionId): boolean =>
      (down.has(id) && !this.previous.has(id)) || this.pressedSinceSample.has(id);
    const justReleased = (id: ActionId): boolean => !down.has(id) && this.previous.has(id);

    const state: InputState = {
      leftFlipper: isDown('left'),
      rightFlipper: isDown('right'),
      plungerHeld: isDown('plunge'),
      plungerReleased: justReleased('plunge'),
      nudgeLeft: justPressed('nudge-left'),
      nudgeRight: justPressed('nudge-right'),
      nudgeUp: justPressed('nudge-up'),
      pausePressed: justPressed('pause'),
      confirmPressed:
        justPressed('left') || justPressed('right') || justPressed('confirm') || this.tapped,
    };

    this.previous.clear();
    for (const id of down) this.previous.add(id);
    this.pressedSinceSample.clear();
    this.tapped = false;

    return state;
  }

  private readGamepad(down: Set<ActionId>): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;

    for (const pad of pads) {
      if (!pad) continue;
      for (const index of PAD_LEFT) if (pad.buttons[index]?.pressed) down.add('left');
      for (const index of PAD_RIGHT) if (pad.buttons[index]?.pressed) down.add('right');
      for (const index of PAD_PLUNGE) if (pad.buttons[index]?.pressed) down.add('plunge');
      for (const index of PAD_PAUSE) if (pad.buttons[index]?.pressed) down.add('pause');
      if ((pad.axes[1] ?? 0) < -0.5) down.add('nudge-up');
    }
  }
}
