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
import { CHASE_TUNE, themeForWorld } from './theme';
import { WorldRenderer } from './draw';
import {
  drawButtonRow,
  drawCornerControls,
  drawTextButton,
  hitButton,
  uiScale,
  type UiButton,
} from './ui';

type Screen =
  | 'title'
  | 'select'
  | 'play'
  | 'paused'
  | 'complete'
  | 'gameOver'
  | 'finished'
  | 'confirmReset';

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
  /** Tappable buttons for the current screen, refreshed every render. */
  private buttons: UiButton[] = [];
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

    // Buttons win over whatever else a tap would have done on this screen,
    // so tapping "pause" never also counts as a tap-to-continue.
    if (ready && tap) {
      const pressed = hitButton(this.buttons, tap.x, tap.y);
      if (pressed) {
        this.pressButton(pressed);
        return;
      }
    }

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
        if (ready && (state.pausePressed || state.confirmPressed || tap)) this.go('play');
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

      case 'confirmReset':
        // Deliberately inert: only the two buttons decide this one.
        break;
    }
  }

  private pressButton(id: string): void {
    this.audio.play('select');
    switch (id) {
      case 'pause':
        this.go('paused');
        break;
      case 'resume':
        this.go('play');
        break;
      case 'mute':
        this.toggleMute();
        break;
      case 'levels':
        this.go('select');
        break;
      case 'retry':
        this.retryLevel();
        break;
      case 'next':
        this.advance();
        break;
      case 'restart':
        this.retryLevel();
        break;
      case 'reset':
        this.go('confirmReset');
        break;
      case 'resetYes':
        this.resetProgress();
        break;
      case 'resetNo':
        this.go('select');
        break;
      case 'play':
        this.go('select');
        break;
      default:
        break;
    }
  }

  /**
   * Wipe every saved score and re-lock the worlds. Only reachable behind a
   * confirmation, because on a shared tablet this is one tap away from
   * destroying a sibling's progress.
   */
  private resetProgress(): void {
    storage.clear();
    this.save = storage.defaultSave();
    this.audio.setMuted(this.save.settings.muted);
    this.audio.stopTune();
    this.levelIndex = 0;
    this.run = createRun();
    this.session = null;
    this.world = null;
    this.go('select');
  }

  private toggleMute(): void {
    const muted = !this.save.settings.muted;
    this.save = { ...this.save, settings: { ...this.save.settings, muted } };
    this.audio.setMuted(muted);
    storage.save(this.save);
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
    this.playMusicFor(def);
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
    this.playMusicFor(next);
  }

  /** Chase levels get their own urgent tune; everything else gets the world's. */
  private playMusicFor(def: LevelDef): void {
    this.audio.playTune(def.chase === undefined ? themeForWorld(def.world).tune : CHASE_TUNE);
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
    this.playMusicFor(def);
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
    let resetButton: UiButton | null = null;

    if (this.screen === 'play' || this.screen === 'paused' || this.screen === 'complete' || this.screen === 'gameOver') {
      this.renderWorld();
    }

    switch (this.screen) {
      case 'title':
        drawTitle(screenCtx, layout, this.tick);
        break;
      case 'select': {
        this.hotspots = drawLevelSelect(screenCtx, layout, this.save, this.levelIndex);
        // Tucked into the bottom corner and rendered quietly: a parent can
        // find it, a child skimming for the next level will not.
        const margin = uiScale(layout) * 0.8;
        resetButton = drawTextButton(
          screenCtx,
          layout,
          margin,
          layout.height - margin - layout.insets.bottom,
          'reset',
          'Erase scores',
          true,
        );
        break;
      }
      default:
        break;
    }

    const hudVisible =
      this.session !== null &&
      !['title', 'select', 'finished', 'confirmReset'].includes(this.screen);
    if (hudVisible && this.session) drawHud(screenCtx, layout, this.session, this.sprites);

    this.buttons = this.renderOverlays();

    // Pause and mute live in the corner during play; elsewhere only mute, and
    // it stays reachable while paused.
    const playing = this.screen === 'play';
    const showsCorner = playing || ['title', 'select', 'paused'].includes(this.screen);
    if (showsCorner) {
      this.buttons = [
        ...this.buttons,
        ...drawCornerControls(screenCtx, layout, this.save.settings.muted, playing, hudVisible),
      ];
    }
    if (resetButton) this.buttons = [...this.buttons, resetButton];

    // The pad is only useful while playing; on the menus it covers the cards.
    if (playing) drawTouchControls(screenCtx, this.input);

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

  /** Draw the overlay for the current screen and return its buttons. */
  private renderOverlays(): UiButton[] {
    const layout = this.renderer.layout;
    const ctx = this.renderer.screen;
    const level = LEVELS[this.levelIndex];
    const buttonRow = layout.height * 0.78;

    switch (this.screen) {
      case 'paused':
        drawOverlay(ctx, layout, { title: 'PAUSED' }, this.tick);
        return drawButtonRow(
          ctx,
          layout,
          buttonRow,
          [
            { id: 'resume', text: 'Keep going' },
            { id: 'restart', text: 'Start level again' },
            { id: 'levels', text: 'Levels' },
          ],
          null,
        );

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
          },
          this.tick,
        );
        return drawButtonRow(
          ctx,
          layout,
          buttonRow,
          [
            { id: 'next', text: nextLevel(level?.id ?? '') ? 'Next level' : 'Continue' },
            { id: 'levels', text: 'Levels' },
          ],
          'next',
        );

      case 'gameOver':
        drawOverlay(
          ctx,
          layout,
          {
            title: 'OH NO',
            lines: ['Roxy is out of lives.', `Score ${formatScore(this.run.score)}`],
          },
          this.tick,
        );
        return drawButtonRow(
          ctx,
          layout,
          buttonRow,
          [
            { id: 'retry', text: 'Try again' },
            { id: 'levels', text: 'Levels' },
          ],
          'retry',
        );

      case 'confirmReset':
        drawOverlay(
          ctx,
          layout,
          {
            title: 'Erase everything?',
            lines: [
              'Every best score and time will be lost,',
              'and worlds 2 and 3 will be locked again.',
            ],
          },
          this.tick,
        );
        return drawButtonRow(
          ctx,
          layout,
          buttonRow,
          [
            { id: 'resetNo', text: 'No, keep it' },
            { id: 'resetYes', text: 'Yes, erase it' },
          ],
          'resetNo',
        );

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
          },
          this.tick,
        );
        return drawButtonRow(ctx, layout, buttonRow, [{ id: 'levels', text: 'Choose a level' }], 'levels');

      default:
        break;
    }

    return [];
  }
}
