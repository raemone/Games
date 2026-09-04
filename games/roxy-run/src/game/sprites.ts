/**
 * Loads the generated sheets and draws from them by name, so no coordinates
 * are hardcoded anywhere in the game - `sprites.ts` in assets/generated is
 * written by the art script and is the single source of truth for the layout.
 */
import roxyUrl from '../assets/generated/roxy.png';
import propsUrl from '../assets/generated/props.png';
import { CELL, PROPS, ROXY, type PropName, type RoxyAnimation } from '../assets/generated/sprites';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${src}`));
    image.src = src;
  });
}

export class Sprites {
  private constructor(
    private readonly roxy: HTMLImageElement,
    private readonly props: HTMLImageElement,
  ) {}

  static async load(): Promise<Sprites> {
    const [roxy, props] = await Promise.all([loadImage(roxyUrl), loadImage(propsUrl)]);
    return new Sprites(roxy, props);
  }

  /** How many frames an animation has, for wrapping a timer. */
  frameCount(animation: RoxyAnimation): number {
    return ROXY[animation].frames;
  }

  /**
   * Draw Roxy centred on (x, y). Frames are drawn on whole pixels: half-pixel
   * placement is what makes scaled-up pixel art shimmer as it moves.
   */
  drawRoxy(
    ctx: CanvasRenderingContext2D,
    animation: RoxyAnimation,
    frame: number,
    x: number,
    y: number,
    flip: boolean,
  ): void {
    const strip = ROXY[animation];
    const column = ((frame % strip.frames) + strip.frames) % strip.frames;
    this.blit(
      ctx,
      this.roxy,
      column * CELL,
      strip.row * CELL,
      CELL,
      CELL,
      Math.round(x - CELL / 2),
      Math.round(y - CELL / 2),
      flip,
    );
  }

  /** Draw a prop centred horizontally on x, with its bottom edge at y. */
  drawProp(
    ctx: CanvasRenderingContext2D,
    name: PropName,
    x: number,
    bottomY: number,
    flip = false,
  ): void {
    const region = PROPS[name];
    this.blit(
      ctx,
      this.props,
      region.x,
      region.y,
      region.w,
      region.h,
      Math.round(x - region.w / 2),
      Math.round(bottomY - region.h),
      flip,
    );
  }

  /** Draw a prop centred on both axes - for things that float, like bones. */
  drawPropCentred(
    ctx: CanvasRenderingContext2D,
    name: PropName,
    x: number,
    y: number,
    flip = false,
  ): void {
    const region = PROPS[name];
    this.blit(
      ctx,
      this.props,
      region.x,
      region.y,
      region.w,
      region.h,
      Math.round(x - region.w / 2),
      Math.round(y - region.h / 2),
      flip,
    );
  }

  private blit(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    flip: boolean,
  ): void {
    if (!flip) {
      ctx.drawImage(image, sx, sy, sw, sh, dx, dy, sw, sh);
      return;
    }
    // Mirror around the sprite's own centre so it does not shift as it turns.
    ctx.save();
    ctx.translate(dx + sw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  }
}

export type { PropName, RoxyAnimation };
