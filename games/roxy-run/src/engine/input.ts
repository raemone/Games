/**
 * One input state from three sources: keyboard, touch and gamepad.
 *
 * Touch buttons live in CSS-pixel screen space rather than in the game's
 * virtual resolution, so they can sit in the letterbox bars instead of on top
 * of the action, and so they stay thumb-sized on a phone and on a tablet.
 */
import type { Layout } from './renderer';

export interface InputState {
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly jumpHeld: boolean;
  /** True only on the frame the jump button went down. */
  readonly jumpPressed: boolean;
  readonly pausePressed: boolean;
  /** Jump, Enter, or a tap anywhere - for menus. */
  readonly confirmPressed: boolean;
}

export type ButtonId = 'left' | 'right' | 'down' | 'jump';

export interface TouchButton {
  readonly id: ButtonId;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

const KEY_MAP: Readonly<Record<string, ButtonId | 'up' | 'pause' | 'confirm'>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyZ: 'jump',
  KeyX: 'jump',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
};

/** Standard-gamepad button indices worth reading. */
const PAD_JUMP = [0, 1, 2, 3];
const PAD_PAUSE = [9];
const PAD_DEADZONE = 0.4;

export class Input {
  /** True once the player has actually touched the screen. */
  touchActive = false;
  /** Put the movement pad on the right instead of the left. */
  mirrored = false;

  private readonly held = new Set<string>();
  private readonly previous = new Set<string>();
  /**
   * Anything that went down since the last sample, even if it was already
   * released again. Without this a tap shorter than one 60Hz tick is dropped
   * entirely - which is exactly what an excited child mashing jump produces.
   */
  private readonly pressedSinceSample = new Set<string>();
  private readonly pointers = new Map<number, ButtonId>();
  private buttons: TouchButton[] = [];
  private tapped = false;
  /** Screen-space position of the most recent tap, for hit-testing menus. */
  private tapPoint: { x: number; y: number } | null = null;
  private readonly detach: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.listen(window, 'keydown', (event) => {
      const key = event as KeyboardEvent;
      const action = KEY_MAP[key.code];
      if (!action) return;
      // Stop the page scrolling under the game.
      key.preventDefault();
      if (key.repeat) return;
      this.held.add(action);
      this.pressedSinceSample.add(action);
    });

    this.listen(window, 'keyup', (event) => {
      const action = KEY_MAP[(event as KeyboardEvent).code];
      if (action) this.held.delete(action);
    });

    // Releasing keys on blur avoids Roxy sprinting off while the tab is hidden.
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

  /** Recompute the touch button positions. Call whenever the window resizes. */
  layout(layout: Layout): void {
    const base = clamp(Math.min(layout.width, layout.height) * 0.12, 40, 84);
    const margin = base * 0.75;
    const gap = base * 0.5;
    const jumpRadius = base * 1.2;
    const rollRadius = base * 0.8;
    // Held sideways, a notched phone eats one edge and the home indicator the
    // bottom; a jump button under either is a button that does not work.
    const bottom = layout.height - margin - layout.insets.bottom;
    const leftEdge = margin + layout.insets.left;
    const rightEdge = layout.width - margin - layout.insets.right;

    const padSide = this.mirrored ? rightEdge : leftEdge;
    const actSide = this.mirrored ? leftEdge : rightEdge;
    const dir = this.mirrored ? -1 : 1;

    this.buttons = [
      { id: 'left', x: padSide + dir * base, y: bottom - base, radius: base },
      { id: 'right', x: padSide + dir * (base * 3 + gap), y: bottom - base, radius: base },
      { id: 'jump', x: actSide - dir * jumpRadius, y: bottom - jumpRadius, radius: jumpRadius },
      {
        id: 'down',
        x: actSide - dir * (jumpRadius * 2 + gap + rollRadius),
        y: bottom - rollRadius,
        radius: rollRadius,
      },
    ];
  }

  get touchButtons(): readonly TouchButton[] {
    return this.buttons;
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

  /** True while a finger is on that button, for drawing the pressed state. */
  isTouching(id: ButtonId): boolean {
    for (const pressed of this.pointers.values()) {
      if (pressed === id) return true;
    }
    return false;
  }

  private onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    // Only a real finger turns the on-screen pad on; a mouse click on a laptop
    // should not clutter the screen with buttons nobody can press.
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      this.touchActive = true;
    }
    this.tapped = true;

    const rect = this.canvas.getBoundingClientRect();
    this.tapPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    const button = this.hitTest(event);
    if (button) {
      this.pointers.set(event.pointerId, button);
      this.pressedSinceSample.add(button);
    }

    // Capture keeps a thumb that slides off a button still reporting moves, but
    // it throws for pointer ids the browser no longer recognises. It is a
    // nicety, so it goes last and its failure is ignored.
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* not capturable; the button still works, it just cannot be slid off */
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault();
    // Let a thumb slide between left and right without lifting off.
    const button = this.hitTest(event);
    if (button) {
      this.pointers.set(event.pointerId, button);
    } else {
      this.pointers.delete(event.pointerId);
    }
  }

  private onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
  }

  private hitTest(event: PointerEvent): ButtonId | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let closest: ButtonId | null = null;
    let closestDistance = Infinity;
    for (const button of this.buttons) {
      const dx = x - button.x;
      const dy = y - button.y;
      const distance = Math.hypot(dx, dy);
      // Generous hit radius: thumbs on a moving tablet are not precise.
      if (distance <= button.radius * 1.35 && distance < closestDistance) {
        closest = button.id;
        closestDistance = distance;
      }
    }
    return closest;
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

    for (const button of this.pointers.values()) down.add(button);
    this.readGamepad(down);

    const isDown = (id: string): boolean => down.has(id);
    /** Went down this tick, or went down and back up between ticks. */
    const justPressed = (id: string): boolean =>
      (down.has(id) && !this.previous.has(id)) || this.pressedSinceSample.has(id);

    const state: InputState = {
      left: isDown('left'),
      right: isDown('right'),
      up: isDown('up'),
      down: isDown('down'),
      jumpHeld: isDown('jump'),
      jumpPressed: justPressed('jump'),
      pausePressed: justPressed('pause'),
      confirmPressed: justPressed('jump') || justPressed('confirm') || this.tapped,
    };

    this.previous.clear();
    for (const id of down) this.previous.add(id);
    this.pressedSinceSample.clear();
    this.tapped = false;

    return state;
  }

  private readGamepad(down: Set<string>): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;

    for (const pad of pads) {
      if (!pad) continue;

      const axisX = pad.axes[0] ?? 0;
      const axisY = pad.axes[1] ?? 0;
      if (axisX < -PAD_DEADZONE || pad.buttons[14]?.pressed) down.add('left');
      if (axisX > PAD_DEADZONE || pad.buttons[15]?.pressed) down.add('right');
      if (axisY > PAD_DEADZONE || pad.buttons[13]?.pressed) down.add('down');
      if (axisY < -PAD_DEADZONE || pad.buttons[12]?.pressed) down.add('up');

      for (const index of PAD_JUMP) {
        if (pad.buttons[index]?.pressed) down.add('jump');
      }
      for (const index of PAD_PAUSE) {
        if (pad.buttons[index]?.pressed) down.add('pause');
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
