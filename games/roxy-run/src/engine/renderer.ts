/**
 * Two-layer renderer.
 *
 * The game world is drawn into a fixed 480x270 offscreen buffer and blitted to
 * the visible canvas scaled up, which is what keeps the pixel art crisp at any
 * window size. The HUD and touch controls are drawn straight onto the visible
 * canvas at full device resolution instead, so text stays legible and the
 * buttons can sit in the letterbox bars rather than on top of the action.
 */

export const VIRTUAL_WIDTH = 480;
export const VIRTUAL_HEIGHT = 270;

/** Beyond this the extra pixels cost far more than they show. */
const MAX_PIXEL_RATIO = 2;

/**
 * An integer scale is used whenever it still fills most of the screen; below
 * that a fractional scale wins, because a big picture with slightly uneven
 * pixels beats a crisp one floating in a sea of black.
 */
const INTEGER_SCALE_THRESHOLD = 0.82;

export interface Layout {
  /** CSS pixels of the visible canvas. */
  readonly width: number;
  readonly height: number;
  /** World buffer scale factor, in CSS pixels per virtual pixel. */
  readonly scale: number;
  /** Top-left of the scaled world buffer, in CSS pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  /** Draw the HUD and touch controls here, in CSS pixels. */
  readonly screen: CanvasRenderingContext2D;
  /** Draw the game world here, in virtual 480x270 pixels. */
  readonly world: CanvasRenderingContext2D;

  private readonly buffer: HTMLCanvasElement;
  private layoutState: Layout = {
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    parent.append(this.canvas);

    const screen = this.canvas.getContext('2d', { alpha: false });
    if (!screen) throw new Error('2D canvas is not available in this browser');
    this.screen = screen;

    this.buffer = document.createElement('canvas');
    this.buffer.width = VIRTUAL_WIDTH;
    this.buffer.height = VIRTUAL_HEIGHT;
    const world = this.buffer.getContext('2d', { alpha: false });
    if (!world) throw new Error('2D canvas is not available in this browser');
    this.world = world;
    this.world.imageSmoothingEnabled = false;

    this.resize();
  }

  get layout(): Layout {
    return this.layoutState;
  }

  /** True when the window is taller than it is wide, i.e. hold it sideways. */
  get isPortrait(): boolean {
    return this.layoutState.height > this.layoutState.width;
  }

  resize(): void {
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Work in CSS pixels everywhere above this line.
    this.screen.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.screen.imageSmoothingEnabled = false;

    const scale = chooseScale(width, height);
    this.layoutState = {
      width,
      height,
      scale,
      offsetX: Math.round((width - VIRTUAL_WIDTH * scale) / 2),
      offsetY: Math.round((height - VIRTUAL_HEIGHT * scale) / 2),
    };
  }

  /** Blit the world buffer onto the visible canvas. Call before drawing the HUD. */
  present(letterbox = '#07040f'): void {
    const { width, height, scale, offsetX, offsetY } = this.layoutState;
    this.screen.fillStyle = letterbox;
    this.screen.fillRect(0, 0, width, height);
    this.screen.drawImage(
      this.buffer,
      offsetX,
      offsetY,
      VIRTUAL_WIDTH * scale,
      VIRTUAL_HEIGHT * scale,
    );
  }

  /** Convert a pointer position from client coordinates to CSS-pixel screen space. */
  toScreen(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
}

function chooseScale(width: number, height: number): number {
  const exact = Math.min(width / VIRTUAL_WIDTH, height / VIRTUAL_HEIGHT);
  const integer = Math.floor(exact);
  if (integer >= 1 && integer / exact >= INTEGER_SCALE_THRESHOLD) return integer;
  return Math.max(exact, 0.1);
}
