/**
 * The shell: which screen is showing, what happens when a level ends, and when
 * progress gets written to disk. The simulation itself lives in Session.
 */
import { Audio } from '../engine/audio';
import { Input, type InputState } from '../engine/input';
import { Renderer } from '../engine/renderer';
import * as storage from '../engine/storage';
import type { SaveData } from '../engine/storage';
import { LEVELS, WORLD_COUNT, nextLevel } from '../levels';
import { drawHud, drawOverlay, drawTouchControls } from './hud';
import { type LevelDef, parseLevel } from './level';
import { createRun, formatScore, formatTime, type Run } from './scoring';
import { drawLevelSelect, drawTitle, hitHotspot, type Hotspot } from './screens';
import { Session } from './session';
import { Sprites } from './sprites';
import { themeForWorld } from './theme';
import { WorldRenderer } from './draw';

type Screen = 'title' | 'select' | 'play' | 'paused' | 'complete' | 'gameOver' | 'finished';

/** How long the victory animation plays before the results panel. */
const VICTORY_TICKS = 90;

export class Game {
  private screen: Screen = 'title';
  private session: Session | null = null;
  private world: WorldRenderer | null = null;
  private run: Run = createRun();
  private save: SaveData;
  private levelIndex = 0;
  private hotspots: Hotspot[] = [];
  private tick = 0;
  /** Blocks input for a few ticks after a screen change, so one tap is one action. */
  private inputCooldown = 0;
  /** Ticks spent watching the victory pose before the results appear. */
  private completeDelay = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly sprites: Sprites,
  ) {
    this.save = storage.load();
    this.audio.setMuted(this.save.settings.muted);
    this.input.mirrored = this.save.settings.mirrorTouch;
    this.input.layout(renderer.layout);
  }

  resize(): void {
    this.renderer.resize();
    this.input.layout(this.renderer.layout);
  }

  update(): void {
    this.tick += 1;
    if (this.inputCooldown > 0) this.inputCooldown -= 1;

    const state = this.input.sample();
    const tap = this.input.takeTap();
    const ready = this.inputCooldown === 0;

    switch (this.screen) {
      case 'title':
        if (ready && (state.confirmPressed || tap)) this.go('select');
        break;

      case 'select':
        this.updateSelect(state, tap, ready);
        break;

      case 'play':
        this.updatePlay(state);
        break;

      case 'paused':
        if (ready && state.pausePressed) this.go('play');
        else if (ready && (state.confirmPressed || tap)) this.go('play');
        break;

      case 'complete':
        if (ready && (state.confirmPressed || tap)) this.advance();
        break;

      case 'gameOver':
        if (ready && (state.confirmPressed || tap)) this.retryLevel();
        break;

      case 'finished':
        if (ready && (state.confirmPressed || tap)) this.go('select');
        break;
    }
  }

  private updateSelect(state: InputState, tap: { x: number; y: number } | null, ready: boolean): void {
    if (!ready) return;

    if (state.right) this.moveSelection(1);
    else if (state.left) this.moveSelection(-1);
    else if (state.down) this.moveSelection(3);
    else if (state.up) this.moveSelection(-3);

    if (tap) {
      const hit = hitHotspot(this.hotspots, tap.x, tap.y);
      if (hit !== null) {
        this.levelIndex = hit;
        this.startLevel(hit);
      }
      return;
    }

    if (state.confirmPressed) this.startLevel(this.levelIndex);
  }

  private moveSelection(delta: number): void {
    const next = this.levelIndex + delta;
    if (next < 0 || next >= LEVELS.length) return;
    this.levelIndex = next;
    this.audio.play('select');
    // Repeat-guard: without this, holding a direction scrolls the whole grid.
    this.inputCooldown = 10;
  }

  private updatePlay(state: InputState): void {
    const session = this.session;
    if (!session) return;

    if (state.pausePressed) {
      this.go('paused');
      return;
    }

    session.update(state);

    if (session.state === 'complete') {
      // Let the victory pose play before the results panel covers it up.
      this.completeDelay += 1;
      if (this.completeDelay >= VICTORY_TICKS) this.completeLevel();
      return;
    }

    if (session.state === 'gameOver') {
      this.go('gameOver');
      return;
    }

    if (session.state === 'timeUp') session.restart();
  }

  private startLevel(index: number): void {
    const def = LEVELS[index];
    if (!def) return;
    if (def.world > this.save.unlockedWorld) {
      // Locked: a small nudge rather than silence, so the tap is not ignored.
      this.audio.play('hurt');
      this.inputCooldown = 20;
      return;
    }

    this.levelIndex = index;
    this.run = createRun();
    this.beginSession(def);
    this.go('play');
    this.audio.playTune(themeForWorld(def.world).tune);
  }

  private beginSession(def: LevelDef): void {
    const theme = themeForWorld(def.world);
    const level = parseLevel(def);
    this.session = new Session(level, theme, this.run, this.audio);
    this.completeDelay = 0;
    this.world = new WorldRenderer(theme, this.sprites, this.renderer.world);
  }

  private completeLevel(): void {
    const session = this.session;
    if (!session) return;

    // Finishing the last level of a world opens the next one.
    const level = LEVELS[this.levelIndex];
    const isLastOfWorld = level ? !LEVELS[this.levelIndex + 1] || LEVELS[this.levelIndex + 1]?.world !== level.world : false;
    const unlocks = isLastOfWorld
      ? Math.min((level?.world ?? 1) + 1, WORLD_COUNT)
      : (level?.world ?? 1);

    this.save = storage.recordResult(
      this.save,
      level?.id ?? 'unknown',
      this.run.score,
      this.run.elapsedMs,
      this.run.lifetimeBones,
      unlocks,
    );
    storage.save(this.save);
    this.go('complete');
  }

  private advance(): void {
    const current = LEVELS[this.levelIndex];
    const next = current ? nextLevel(current.id) : undefined;
    if (!next) {
      this.audio.stopTune();
      this.go('finished');
      return;
    }

    this.levelIndex = LEVELS.indexOf(next);
    // Score and lives carry across levels; only the clock resets.
    this.run.elapsedMs = 0;
    this.beginSession(next);
    this.go('play');
    this.audio.playTune(themeForWorld(next.world).tune);
  }

  private retryLevel(): void {
    const def = LEVELS[this.levelIndex];
    if (!def) {
      this.go('select');
      return;
    }
    this.run = createRun();
    this.beginSession(def);
    this.go('play');
  }

  private go(screen: Screen): void {
    this.screen = screen;
    // Long enough that the tap which opened a screen cannot also dismiss it.
    this.inputCooldown = Math.max(this.inputCooldown, 18);
    if (screen === 'title' || screen === 'select') this.audio.stopTune();
  }

  render(): void {
    const layout = this.renderer.layout;
    const screenCtx = this.renderer.screen;

    if (this.screen === 'play' || this.screen === 'paused' || this.screen === 'complete' || this.screen === 'gameOver') {
      this.renderWorld();
    }

    switch (this.screen) {
      case 'title':
        drawTitle(screenCtx, layout, this.tick);
        break;
      case 'select':
        this.hotspots = drawLevelSelect(screenCtx, layout, this.save, this.levelIndex);
        break;
      default:
        break;
    }

    if (this.session && this.screen !== 'title' && this.screen !== 'select' && this.screen !== 'finished') {
      drawHud(screenCtx, layout, this.session);
    }

    this.renderOverlays();
    // The pad is only useful while playing; on the menus it covers the cards.
    if (this.screen === 'play') drawTouchControls(screenCtx, this.input);

    if (this.renderer.isPortrait) {
      drawOverlay(screenCtx, layout, {
        title: 'Turn sideways',
        lines: ['Roxy needs a wide screen to run.'],
      }, this.tick);
    }
  }

  private renderWorld(): void {
    const session = this.session;
    const world = this.world;
    if (!session || !world) return;
    world.draw(this.renderer.world, session);
    this.renderer.present();
  }

  private renderOverlays(): void {
    const layout = this.renderer.layout;
    const ctx = this.renderer.screen;
    const level = LEVELS[this.levelIndex];

    switch (this.screen) {
      case 'paused':
        drawOverlay(ctx, layout, { title: 'PAUSED', prompt: 'Tap to keep going' }, this.tick);
        break;

      case 'complete':
        drawOverlay(
          ctx,
          layout,
          {
            title: 'GOOD DOG!',
            lines: [
              level?.name ?? '',
              `Score ${formatScore(this.run.score)}`,
              `Time ${formatTime(this.run.elapsedMs)}`,
            ],
            prompt: nextLevel(level?.id ?? '') ? 'Tap for the next level' : 'Tap to continue',
          },
          this.tick,
        );
        break;

      case 'gameOver':
        drawOverlay(
          ctx,
          layout,
          {
            title: 'OH NO',
            lines: ['Roxy is out of lives.', `Score ${formatScore(this.run.score)}`],
            prompt: 'Tap to try again',
          },
          this.tick,
        );
        break;

      case 'finished':
        drawOverlay(
          ctx,
          layout,
          {
            title: 'YOU DID IT!',
            lines: [
              'Roxy ran every world.',
              `Final score ${formatScore(this.run.score)}`,
              `Bones collected in all ${this.save.totalBones}`,
            ],
            prompt: 'Tap to choose another level',
          },
          this.tick,
        );
        break;

      default:
        break;
    }
  }
}
