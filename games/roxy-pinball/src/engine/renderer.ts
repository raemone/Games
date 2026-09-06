/**
 * Two canvases, stacked.
 *
 * The table is drawn in WebGL on the lower one. The score, the buttons and the
 * menus are drawn in 2D on the upper one, in CSS pixels, because text and
 * thumb-sized controls want the device's own resolution and no perspective.
 * Only the top canvas takes pointer events, so there is one place that turns a
 * touch into a coordinate.
 */

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Layout {
  /** CSS pixels of the visible canvas. */
  readonly width: number;
  readonly height: number;
  /** The band above the table, where the score and the mission banner live. */
  readonly hudHeight: number;
  /** The band below it, which holds the plunger and nudge buttons. */
  readonly barHeight: number;
  /**
   * The column the score and the buttons live in. On a phone it is the whole
   * screen; on a desktop monitor it stops the button strip from being a metre
   * wide and the score from sitting half a screen away from the table.
   */
  readonly contentLeft: number;
  readonly contentWidth: number;
  readonly insets: Insets;
}

/** Beyond this the extra pixels cost far more than they show. */
const MAX_PIXEL_RATIO = 2;

/** Wide enough for the score at full size, and no wider. */
const MAX_CONTENT_WIDTH = 560;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export class Renderer {
  /** The WebGL canvas the table is rendered into. */
  readonly tableCanvas: HTMLCanvasElement;
  /** The 2D canvas on top, and the one that takes every pointer event. */
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  private layoutState: Layout = {
    width: 1,
    height: 1,
    hudHeight: 0,
    barHeight: 0,
    contentLeft: 0,
    contentWidth: 1,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  private ratio = 1;

  /**
   * A zero-sized element whose padding is set from the env() safe-area values.
   * Reading them back is the only way to get at those numbers from canvas code.
   */
  private readonly insetProbe = createInsetProbe();

  constructor(parent: HTMLElement) {
    this.tableCanvas = document.createElement('canvas');
    this.tableCanvas.style.cssText = 'position:absolute;inset:0;display:block';
    parent.append(this.tableCanvas);

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none';
    parent.append(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available in this browser');
    this.ctx = ctx;

    document.body.append(this.insetProbe);
    this.resize();
  }

  get layout(): Layout {
    return this.layoutState;
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  resize(): void {
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    this.ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

    this.canvas.width = Math.floor(width * this.ratio);
    this.canvas.height = Math.floor(height * this.ratio);
    for (const canvas of [this.canvas, this.tableCanvas]) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const insets = readInsets(this.insetProbe);
    const hudHeight = clamp(height * 0.12, 62, 116) + insets.top;
    const barHeight = clamp(height * 0.1, 56, 92) + insets.bottom;
    const contentWidth = Math.min(width - 20 - insets.left - insets.right, MAX_CONTENT_WIDTH);

    this.layoutState = {
      width,
      height,
      hudHeight,
      barHeight,
      contentLeft: Math.round((width - contentWidth) / 2),
      contentWidth,
      insets,
    };
  }

  /** Clear the overlay and work in CSS pixels. Call once per frame. */
  beginScreen(): void {
    this.ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    this.ctx.clearRect(0, 0, this.layoutState.width, this.layoutState.height);
  }

  /** Convert a pointer position from client coordinates to CSS-pixel space. */
  toScreen(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
}

function createInsetProbe(): HTMLDivElement {
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';');
  return probe;
}

function readInsets(probe: HTMLDivElement): Insets {
  const style = getComputedStyle(probe);
  const read = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    top: read(style.paddingTop),
    right: read(style.paddingRight),
    bottom: read(style.paddingBottom),
    left: read(style.paddingLeft),
  };
}
