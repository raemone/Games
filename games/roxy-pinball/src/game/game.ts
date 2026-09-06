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
import { NameEntry } from '../engine/name-entry';
import type { BoardEntry } from '../engine/leaderboard';
import { fetchTop, loadName, saveName, submitScore } from '../engine/leaderboard';
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
  private readonly nameEntry: NameEntry;
  /** The global board, or null until it loads - or for ever, if it cannot. */
  private globalTop: readonly BoardEntry[] | null = null;
  private globalRank: number | null = null;
  private gameStartTick = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    parent: HTMLElement,
  ) {
    this.data = load();
    this.audio.setMuted(this.data.settings.muted);
    this.session = new Session(audio);
    this.scene = new TableScene(renderer.tableCanvas);
    this.nameEntry = new NameEntry(parent);

    // Fire and forget: the attract screen shows the global board if it arrives
    // and this device's own scores if it does not.
    void fetchTop().then((top) => {
      this.globalTop = top;
    });
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
    // Just above the PLAY AGAIN button the game over screen paints.
    this.nameEntry.place(layout.barHeight + 94);
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
    this.globalRank = null;
    this.gameStartTick = this.tick;
    this.nameEntry.hide();
    this.nameEntry.reset();
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
    this.offerTheBoard();
  }

  /**
   * Offer to put the score on the global board. A game worth nothing is not
   * worth naming, and the server would reject it anyway.
   */
  private offerTheBoard(): void {
    if (this.session.score.score <= 0) return;
    this.nameEntry.show(loadName(), (name) => void this.sendScore(name));
  }

  private async sendScore(name: string): Promise<void> {
    saveName(name);
    this.nameEntry.setBusy(true);
    this.nameEntry.setStatus('Sending...');

    const outcome = await submitScore({
      name,
      score: Math.round(this.session.score.score),
      missions: this.session.missions.completed.length,
      seconds: Math.max(1, Math.round((this.tick - this.gameStartTick) / 60)),
      day: today(),
    });

    if (outcome.kind === 'offline') {
      this.nameEntry.setBusy(false);
      this.nameEntry.setStatus('No connection - the score is saved on this device.', 'bad');
      return;
    }
    if (outcome.kind === 'rejected') {
      this.nameEntry.setBusy(false);
      this.nameEntry.setStatus(outcome.reason, 'bad');
      return;
    }

    this.globalRank = outcome.result.rank;
    this.globalTop = outcome.result.top;
    this.nameEntry.collapse();
    this.nameEntry.setStatus(
      outcome.result.rank === null
        ? 'On the board, but not the top two hundred. Good dog anyway.'
        : `On the global board at number ${outcome.result.rank + 1}.`,
      'good',
    );
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
    if (this.screen === 'playing' || this.screen === 'paused') {
      drawHud(ctx, layout, this.session, this.data.settings.muted);
      drawApron(ctx, layout, this.session);
      drawControls(ctx, layout, this.input, this.session);
      drawBanner(ctx, layout, this.session);
    }

    switch (this.screen) {
      case 'attract':
        drawAttract(ctx, layout, this.data, this.tick, this.globalTop);
        return;
      case 'paused':
        drawPaused(ctx, layout);
        return;
      case 'gameOver':
        drawGameOver(ctx, layout, this.session, this.rank, this.tick, this.globalRank);
        return;
      case 'playing':
        return;
    }
  }
}
