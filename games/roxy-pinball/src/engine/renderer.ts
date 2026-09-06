/**
 * Fits the table on the screen and hands out the transform that turns table
 * coordinates into screen ones.
 *
 * Unlike a pixel-art game, nothing here is drawn into a low-resolution buffer:
 * a pinball table is arcs, rails and lettering, and those want the device's
 * full resolution. So the whole playfield is drawn at native scale with a
 * transform, and the HUD is drawn on top in CSS pixels.
 */
import { TABLE_HEIGHT, TABLE_WIDTH } from '../game/table';

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
  /** Screen pixels per table pixel. */
  readonly scale: number;
  /** Top-left of the drawn table, in CSS pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
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

/** Wide enough for the score at full size, and no wider. */
const MAX_CONTENT_WIDTH = 560;

/** Beyond this the extra pixels cost far more than they show. */
const MAX_PIXEL_RATIO = 2.5;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  /** Draw here. Everything is in CSS pixels until `beginTable` is called. */
  readonly ctx: CanvasRenderingContext2D;

  private layoutState: Layout = {
    width: TABLE_WIDTH,
    height: TABLE_HEIGHT,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    hudHeight: 0,
    barHeight: 0,
    contentLeft: 0,
    contentWidth: TABLE_WIDTH,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  private ratio = 1;

  /**
   * A zero-sized element whose padding is set from the env() safe-area values.
   * Reading them back is the only way to get at those numbers from canvas code.
   */
  private readonly insetProbe = createInsetProbe();

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    parent.append(this.canvas);

    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas is not available in this browser');
    this.ctx = ctx;

    document.body.append(this.insetProbe);
    this.resize();
  }

  get layout(): Layout {
    return this.layoutState;
  }

  resize(): void {
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    this.ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

    this.canvas.width = Math.floor(width * this.ratio);
    this.canvas.height = Math.floor(height * this.ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const insets = readInsets(this.insetProbe);
    const hudHeight = clamp(height * 0.12, 62, 116) + insets.top;
    const barHeight = clamp(height * 0.1, 56, 92) + insets.bottom;

    const availableHeight = Math.max(80, height - hudHeight - barHeight);
    const availableWidth = Math.max(80, width - 12 - insets.left - insets.right);
    const scale = Math.min(availableWidth / TABLE_WIDTH, availableHeight / TABLE_HEIGHT);
    const contentWidth = Math.min(
      width - 20 - insets.left - insets.right,
      Math.max(MAX_CONTENT_WIDTH, TABLE_WIDTH * scale),
    );

    this.layoutState = {
      width,
      height,
      scale,
      offsetX: Math.round((width - TABLE_WIDTH * scale) / 2),
      offsetY: Math.round(hudHeight + (availableHeight - TABLE_HEIGHT * scale) / 2),
      hudHeight,
      barHeight,
      contentLeft: Math.round((width - contentWidth) / 2),
      contentWidth,
      insets,
    };
  }

  /** Work in CSS pixels: the HUD, the buttons and the menus. */
  beginScreen(): void {
    this.ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
  }

  /** Work in table coordinates, 0..380 by 0..680. */
  beginTable(): void {
    const { scale, offsetX, offsetY } = this.layoutState;
    this.ctx.setTransform(
      this.ratio * scale,
      0,
      0,
      this.ratio * scale,
      this.ratio * offsetX,
      this.ratio * offsetY,
    );
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
