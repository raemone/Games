/**
 * The layer above the table: which screen is showing, what the buttons do, and
 * when a finished game is written to the high score table.
 *
 * The attract screen runs a real game behind the menu with a crude auto-flipper
 * driving it, so the table is never a still photograph - a pinball machine
 * nobody is playing still has a ball on it.
 */
import { ATTRACT_TUNE, PLAY_TUNE } from '../engine/audio';
import type { Audio } from '../engine/audio';
import type { Input, InputState } from '../engine/input';
import type { Renderer } from '../engine/renderer';
import type { SaveData } from '../engine/storage';
import { load, rankOf, recordGame, save as persist, today } from '../engine/storage';
import { TableScene } from '../render/scene';
import { APRON_HEIGHT } from './hud';
import { drawApron, drawBanner, drawControls, drawHud, hitHudButton } from './hud';
import {
  attractButtons,
  drawAttract,
  drawGameOver,
  drawPaused,
  gameOverButtons,
  hitButton,
  pauseButtons,
} from './screens';
import { Session } from './session';
import { flipperTip } from './physics';

type Screen = 'attract' | 'playing' | 'paused' | 'gameOver';

const NEUTRAL: InputState = {
  leftFlipper: false,
  rightFlipper: false,
  plungerHeld: false,
  plungerReleased: false,
  nudgeLeft: false,
  nudgeRight: false,
  nudgeUp: false,
  pausePressed: false,
  confirmPressed: false,
};

/** How close a ball has to be to a flipper before the attract demo swings it. */
const DEMO_REACH = 46;

export class Game {
  private screen: Screen = 'attract';
  private session: Session;
  private data: SaveData;
  private tick = 0;
  private rank = -1;
  private readonly scene: TableScene;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
  ) {
    this.data = load();
    this.audio.setMuted(this.data.settings.muted);
    this.session = new Session(audio);
    this.scene = new TableScene(renderer.tableCanvas);
  }

  resize(): void {
    this.renderer.resize();
    this.input.layout(this.renderer.layout);
    const layout = this.renderer.layout;
    this.scene.resize(
      layout.width,
      layout.height,
      this.renderer.pixelRatio,
      layout.hudHeight,
      // The apron sits above the button strip and is opaque, so the table has
      // to clear it too or its own bottom edge is hidden behind the hint text.
      layout.barHeight + APRON_HEIGHT,
    );
  }

  update(): void {
    this.tick++;
    const input = this.input.sample();

    switch (this.screen) {
      case 'attract':
        this.updateAttract(input);
        return;
      case 'playing':
        this.updatePlaying(input);
        return;
      case 'paused':
        this.updatePaused(input);
        return;
      case 'gameOver':
        this.updateGameOver(input);
        return;
    }
  }

  private updateAttract(input: InputState): void {
    this.audio.playTune(ATTRACT_TUNE);
    // The demo plays itself, badly, which is exactly what an attract mode wants.
    this.session.update(this.demoInput());
    if (this.session.phase === 'gameOver' && this.session.gameOverTicks <= 0) {
      this.session.restart();
    }

    const tap = this.input.takeTap();
    const pressed = tap ? hitButton(attractButtons(this.renderer.layout), tap) : null;
    if (pressed === 'play' || (input.confirmPressed && !tap)) this.startGame();
    else if (tap) this.handleHudTap(tap);
  }

  private demoInput(): InputState {
    // Pulsed rather than held: a flipper held up is a flipper that cannot hit
    // anything, and a ball cradled on one would sit there until the tab closes.
    const swing = this.tick % 26 < 11;
    let left = false;
    let right = false;
    for (const ball of this.session.activeBalls) {
      for (const flipper of this.session.flippers) {
        const tip = flipperTip(flipper);
        if (Math.hypot(ball.x - tip.x, ball.y - tip.y) > DEMO_REACH) continue;
        if (flipper.pivot.x < 173) left = swing;
        else right = swing;
      }
    }
    // The demo plunges on a loop rather than waiting for the ten-second timeout,
    // so an attract screen left running is never a still table.
    const phase = this.tick % 150;
    return {
      ...NEUTRAL,
      leftFlipper: left,
      rightFlipper: right,
      plungerHeld: phase < 60,
      plungerReleased: phase === 60,
    };
  }

  private startGame(): void {
    this.session.restart();
    this.screen = 'playing';
    this.rank = -1;
    this.audio.playTune(PLAY_TUNE);
    this.audio.play('select');
  }

  private updatePlaying(input: InputState): void {
    const tap = this.input.takeTap();
    if (tap && this.handleHudTap(tap)) return;
    if (input.pausePressed) {
      this.screen = 'paused';
      this.audio.play('select');
      return;
    }

    this.session.update(input);

    if (this.session.phase === 'gameOver' && this.session.gameOverTicks <= 0) {
      this.finishGame();
    }
  }

  private finishGame(): void {
    this.rank = rankOf(this.data, this.session.score.score);
    this.data = recordGame(
      this.data,
      this.session.score.score,
      this.session.missions.completed,
      today(),
    );
    persist(this.data);
    this.screen = 'gameOver';
    this.audio.playTune(ATTRACT_TUNE);
  }

  private updatePaused(input: InputState): void {
    const tap = this.input.takeTap();
    if (tap && this.handleHudTap(tap)) return;

    const pressed = tap ? hitButton(pauseButtons(this.renderer.layout), tap) : null;
    if (pressed === 'resume' || input.pausePressed) {
      this.screen = 'playing';
      this.audio.play('select');
      return;
    }
    if (pressed === 'quit') {
      this.finishGame();
      this.audio.play('select');
    }
  }

  private updateGameOver(input: InputState): void {
    this.session.update(NEUTRAL);
    const tap = this.input.takeTap();
    if (tap && this.handleHudTap(tap)) return;

    const pressed = tap ? hitButton(gameOverButtons(this.renderer.layout), tap) : null;
    if (pressed === 'play' || (input.confirmPressed && !tap)) this.startGame();
  }

  /** The mute and pause icons work on every screen. Returns true if one was hit. */
  private handleHudTap(tap: { x: number; y: number }): boolean {
    const button = hitHudButton(this.renderer.layout, tap);
    if (button === 'mute') {
      const muted = !this.data.settings.muted;
      this.data = { ...this.data, settings: { ...this.data.settings, muted } };
      persist(this.data);
      this.audio.setMuted(muted);
      return true;
    }
    if (button === 'pause' && this.screen === 'playing') {
      this.screen = 'paused';
      return true;
    }
    if (button === 'pause' && this.screen === 'paused') {
      this.screen = 'playing';
      return true;
    }
    return false;
  }

  render(): void {
    const ctx = this.renderer.ctx;
    const layout = this.renderer.layout;

    this.scene.sync(this.session, this.tick);
    this.scene.render();

    this.renderer.beginScreen();
    if (this.screen !== 'attract') {
      drawHud(ctx, layout, this.session, this.data.settings.muted);
      drawApron(ctx, layout, this.session);
      drawControls(ctx, layout, this.input, this.session);
      drawBanner(ctx, layout, this.session);
    }

    switch (this.screen) {
      case 'attract':
        drawAttract(ctx, layout, this.data, this.tick);
        return;
      case 'paused':
        drawPaused(ctx, layout);
        return;
      case 'gameOver':
        drawGameOver(ctx, layout, this.session, this.rank, this.tick);
        return;
      case 'playing':
        return;
    }
  }
}
