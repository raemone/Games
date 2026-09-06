/**
 * The shell: which screen is showing, what happens when a level ends, and when
 * progress gets written to disk. The simulation itself lives in Session.
 */
import { Audio } from '../engine/audio';
import { Input, type InputState } from '../engine/input';
import { Renderer } from '../engine/renderer';
import * as storage from '../engine/storage';
import type { SaveData } from '../engine/storage';
import {
  type Board,
  type OverallBoard,
  type Standing,
  boardEnabled,
  fetchBoard,
  fetchOverall,
  postRun,
} from '../engine/leaderboard';
import { LEVELS, WORLD_COUNT, nextLevel } from '../levels';
import { type BoardStatus, boardFrame, drawBoard, drawInitials, stepCharacter } from './board';
import { drawHud, drawOverlay, drawTouchControls } from './hud';
import { type LevelDef, parseLevel } from './level';
import { createRun, formatScore, formatTime, type Run } from './scoring';
import { type TitleBoard, drawLevelSelect, drawTitle, hitHotspot, type Hotspot } from './screens';
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
  | 'board'
  | 'initials'
  | 'askShare';

/** A finished run waiting to be posted to the world board. */
interface PendingPost {
  readonly levelId: string;
  readonly score: number;
  readonly timeMs: number;
}

/** Where the initials screen goes when it is done. */
type AfterInitials = 'board' | 'post';

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

  /** The world board being shown, and whether it arrived. */
  private board: Board | null = null;
  private boardStatus: BoardStatus = 'loading';
  /**
   * Which board request is the current one.
   *
   * Flicking through levels starts a request per level, and they can come back
   * in any order; without this, a slow answer for the level you have left
   * paints over the level you are looking at.
   */
  private boardRequest = 0;
  /** The run waiting to go to the board, if the player agrees to post it. */
  private pending: PendingPost | null = null;
  /** Where the last posted run landed, shown on the results panel. */
  private standing: Standing | null = null;
  /** The overall board shown on the title screen. */
  private overall: OverallBoard | null = null;
  private overallStatus: TitleBoard['status'] = 'off';
  private initialsChars: string[] = ['A', 'A', 'A'];
  private initialsSlot = 0;
  private afterInitials: AfterInitials = 'post';

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
    // The game opens on the title screen without going through go(), so the
    // first visit to it has to ask for the board here.
    this.loadOverall();
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

      case 'askShare':
        // Deliberately inert: only the buttons decide this one. A tap-anywhere
        // shortcut on a question about posting a child's score is not a
        // shortcut, it is an answer nobody gave.
        break;

      case 'board':
        this.updateBoard(state, ready);
        break;

      case 'initials':
        this.updateInitials(state, ready);
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
      case 'title':
        this.audio.stopTune();
        this.go('title');
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
      case 'play':
        this.go('select');
        break;
      case 'board':
        this.openBoard();
        break;
      case 'boardPrev':
        this.stepBoardLevel(-1);
        break;
      case 'boardNext':
        this.stepBoardLevel(1);
        break;
      case 'editInitials':
        this.openInitials('board');
        break;
      case 'shareToggle':
        // From "ask me", turning it on here is the answer, so the game does not
        // go on to ask at the end of the next level.
        this.setShare(this.save.settings.share === 'yes' ? 'no' : 'yes');
        break;
      case 'shareYes':
        this.setShare('yes');
        this.postPending();
        break;
      case 'shareNo':
        this.setShare('no');
        this.pending = null;
        this.go('complete');
        break;
      case 'initialsOk':
        this.commitInitials();
        break;
      default:
        this.pressInitialsButton(id);
        break;
    }
  }

  /** The up, down and slot buttons on the initials screen share a shape. */
  private pressInitialsButton(id: string): void {
    const match = /^(up|down|slot)([0-2])$/.exec(id);
    if (!match) return;
    const slot = Number(match[2]);
    this.initialsSlot = slot;
    if (match[1] === 'slot') return;
    this.initialsChars[slot] = stepCharacter(this.initialsChars[slot] ?? 'A', match[1] === 'up' ? 1 : -1);
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

  /**
   * The world board for whichever level is selected.
   *
   * Boards are per level rather than one global table because a single "best
   * score" across nine levels rewards grinding the most generous one, and
   * because the interesting question to a child is who is fastest on the level
   * they are stuck on.
   */
  private openBoard(): void {
    this.go('board');
    this.loadBoard();
  }

  private loadBoard(): void {
    const level = LEVELS[this.levelIndex];
    if (!level) return;

    // Clear what is on screen first. Every caller is changing something the
    // board depends on - the level, or which player is asking - so leaving the
    // old one up means showing another player's standing as though it were
    // yours, right up until the answer arrives.
    this.board = null;
    this.boardStatus = 'loading';

    this.boardRequest += 1;
    const request = this.boardRequest;
    void fetchBoard(level.id, this.save.playerId).then((board) => {
      // Ignore an answer to a question we have since moved on from.
      if (request !== this.boardRequest) return;
      if (this.reconcile(board?.you?.initials)) {
        this.loadBoard();
        return;
      }
      this.board = board;
      this.boardStatus = board ? 'ready' : 'error';
    });
  }

  /** Flick to the neighbouring level's board, skipping ones still locked. */
  private stepBoardLevel(delta: number): void {
    const next = this.levelIndex + delta;
    const level = LEVELS[next];
    if (!level || level.world > this.save.unlockedWorld) return;
    this.levelIndex = next;
    this.loadBoard();
    this.inputCooldown = 10;
  }

  private updateBoard(state: InputState, ready: boolean): void {
    if (!ready) return;
    if (state.right) this.stepBoardLevel(1);
    else if (state.left) this.stepBoardLevel(-1);
    else if (state.confirmPressed) this.go('select');
  }

  private setShare(share: storage.SharePreference): void {
    this.save = { ...this.save, settings: { ...this.save.settings, share } };
    storage.save(this.save);
  }

  /** True when a run could be posted at all: a board exists and was allowed. */
  private canPost(): boolean {
    return boardEnabled() && this.save.settings.share !== 'no';
  }

  private openInitials(after: AfterInitials): void {
    const existing = this.save.initials || 'AAA';
    this.initialsChars = [0, 1, 2].map((slot) => existing[slot] ?? 'A');
    this.initialsSlot = 0;
    this.afterInitials = after;
    this.go('initials');
  }

  private updateInitials(state: InputState, ready: boolean): void {
    if (!ready) return;

    const slot = this.initialsSlot;
    if (state.up || state.down) {
      this.initialsChars[slot] = stepCharacter(this.initialsChars[slot] ?? 'A', state.up ? 1 : -1);
      this.audio.play('select');
      this.inputCooldown = 8;
      return;
    }

    if (state.left || state.right) {
      this.initialsSlot = Math.min(2, Math.max(0, slot + (state.right ? 1 : -1)));
      this.inputCooldown = 10;
      return;
    }

    if (state.confirmPressed) this.commitInitials();
  }

  private commitInitials(): void {
    // Switches player as well as label: these initials get their own id, so
    // the runs already on the board keep the name they were posted under.
    this.save = storage.withInitials(this.save, this.initialsChars.join(''));
    storage.save(this.save);
    // The last player's rank is not this one's.
    this.standing = null;
    if (this.afterInitials === 'post') {
      this.postPending();
      return;
    }
    this.go('board');
    this.loadBoard();
  }

  /**
   * Send the finished run, then get out of the way.
   *
   * The results panel is shown immediately rather than waiting for the network:
   * a child who has just finished a level should never be looking at a spinner,
   * and the rank simply appears a moment later if it arrives at all.
   */
  private postPending(): void {
    const pending = this.pending;
    if (!pending) {
      this.go('complete');
      return;
    }

    if (!this.save.initials) {
      this.openInitials('post');
      return;
    }

    this.pending = null;
    this.go('complete');
    void postRun({
      levelId: pending.levelId,
      playerId: this.save.playerId,
      initials: this.save.initials,
      score: pending.score,
      timeMs: pending.timeMs,
    }).then((standing) => {
      // A slow answer for a level the player has already left would otherwise
      // put last level's rank on this level's results panel.
      if (LEVELS[this.levelIndex]?.id !== pending.levelId) return;
      // The run is already recorded under whatever name the board holds for
      // this id. Nothing can move it, but the next one can go to the right
      // player, and showing a rank belonging to someone else would be a lie.
      if (this.reconcile(standing?.initials)) return;
      this.standing = standing;
    });
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

    this.standing = null;
    this.pending = level
      ? { levelId: level.id, score: this.run.score, timeMs: Math.round(this.run.elapsedMs) }
      : null;

    if (!this.canPost() || !this.pending) {
      this.pending = null;
      this.go('complete');
      return;
    }

    // The one time the family is ever asked: there is now something real to
    // post, so the question is concrete rather than a settings toggle nobody
    // would have read.
    if (this.save.settings.share === 'ask') {
      this.go('askShare');
      return;
    }

    this.postPending();
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

  /**
   * Believe the board about who this id is, and start again if it is not us.
   *
   * Returns true when the identity changed, which means whatever was just
   * fetched belongs to somebody else and the caller should ask again.
   */
  private reconcile(boardInitials: string | undefined): boolean {
    const reconciled = storage.reconcilePlayer(this.save, boardInitials);
    if (reconciled === this.save) return false;

    this.save = reconciled;
    storage.save(this.save);
    this.standing = null;
    return true;
  }

  /**
   * Fetch the overall board for the title screen.
   *
   * Once per visit to the title screen rather than on a timer: the board
   * changes when somebody finishes a level, and coming back to the front of
   * the game is exactly when that has just happened.
   */
  private loadOverall(): void {
    if (!boardEnabled()) return;
    this.overallStatus = 'loading';
    void fetchOverall(this.save.playerId).then((board) => {
      if (this.screen !== 'title') return;
      // Asked before anyone has played a level, so this is usually where a
      // wrongly held id is caught - long before it can post anything.
      if (this.reconcile(board?.you?.initials)) {
        this.loadOverall();
        return;
      }
      this.overall = board;
      this.overallStatus = board ? 'ready' : 'error';
    });
  }

  private go(screen: Screen): void {
    if (screen === 'title' && this.screen !== 'title') this.loadOverall();
    this.screen = screen;
    // Long enough that the tap which opened a screen cannot also dismiss it.
    this.inputCooldown = Math.max(this.inputCooldown, 18);
    if (screen === 'title' || screen === 'select') this.audio.stopTune();
  }

  render(): void {
    const layout = this.renderer.layout;
    const screenCtx = this.renderer.screen;
    /** Buttons belonging to a full-screen menu, kept out of the overlay row. */
    const extraButtons: UiButton[] = [];

    if (['play', 'paused', 'complete', 'gameOver', 'askShare'].includes(this.screen)) {
      this.renderWorld();
    }

    switch (this.screen) {
      case 'title':
        drawTitle(screenCtx, layout, this.tick, {
          status: this.overallStatus,
          board: this.overall,
        });
        break;
      case 'select': {
        this.hotspots = drawLevelSelect(screenCtx, layout, this.save, this.levelIndex);
        // Tucked into the bottom corner and rendered quietly: a parent can
        // find it, a child skimming for the next level will not.
        const margin = uiScale(layout) * 0.8;
        const bottom = layout.height - margin - layout.insets.bottom;
        // Top left, where a back control belongs, and clear of the mute and
        // pause icons in the opposite corner.
        extraButtons.push(
          drawTextButton(
            screenCtx,
            layout,
            margin,
            layout.insets.top + margin + uiScale(layout),
            'title',
            '< Home',
            true,
          ),
        );
        if (boardEnabled()) {
          extraButtons.push(
            drawTextButton(
              screenCtx,
              layout,
              layout.width - margin - layout.insets.right - uiScale(layout) * 8,
              bottom,
              'board',
              'World board',
              true,
            ),
          );
        }
        break;
      }
      case 'board':
        extraButtons.push(...this.renderBoard());
        break;
      case 'initials':
        extraButtons.push(...this.renderInitials());
        break;
      default:
        break;
    }

    const hudVisible =
      this.session !== null &&
      !['title', 'select', 'finished', 'board', 'initials'].includes(this.screen);
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
    if (extraButtons.length > 0) this.buttons = [...this.buttons, ...extraButtons];

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

  /** The world board screen: the table, and the controls under it. */
  private renderBoard(): UiButton[] {
    const layout = this.renderer.layout;
    const ctx = this.renderer.screen;
    const level = LEVELS[this.levelIndex];

    const view = {
      levelName: level?.name ?? '',
      status: this.boardStatus,
      board: this.board,
    };
    // One frame for both: what is drawn and what is tappable come out of the
    // same numbers, so they cannot drift apart.
    const frame = boardFrame(layout, view);
    drawBoard(ctx, layout, view, frame);

    const row = drawButtonRow(
      ctx,
      layout,
      frame.buttonsY,
      [
        { id: 'boardPrev', text: '<' },
        { id: 'levels', text: 'Back' },
        { id: 'boardNext', text: '>' },
      ],
      'levels',
    );

    const size = uiScale(layout);
    const margin = size * 0.8;
    const bottom = layout.height - margin - layout.insets.bottom;

    // Both of these are the player's own business rather than part of the
    // board, so they sit quietly in the corners like the erase button does.
    // "Ask me" is its own label because a family who has not been asked yet is
    // not the same as one who said no, and showing them "off" would be a lie.
    const share = this.save.settings.share;
    const shareLabel = share === 'yes' ? 'Posting: on' : share === 'no' ? 'Posting: off' : 'Posting: ask me';
    return [
      ...row,
      drawTextButton(ctx, layout, margin, bottom, 'editInitials', `Initials: ${this.save.initials || '---'}`, true),
      drawTextButton(
        ctx,
        layout,
        layout.width - margin - layout.insets.right - size * 9,
        bottom,
        'shareToggle',
        shareLabel,
        true,
      ),
    ];
  }

  private renderInitials(): UiButton[] {
    const layout = this.renderer.layout;
    const ctx = this.renderer.screen;

    const slots = drawInitials(ctx, layout, {
      characters: this.initialsChars,
      slot: this.initialsSlot,
      tick: this.tick,
      note:
        this.afterInitials === 'post'
          ? 'This is all the board will show about you.'
          : 'Shown next to your scores on the world board.',
    });

    return [...slots, ...drawButtonRow(ctx, layout, layout.height * 0.82, [{ id: 'initialsOk', text: 'Done' }], 'initialsOk')];
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

      case 'askShare':
        drawOverlay(
          ctx,
          layout,
          {
            title: 'Join the world board?',
            lines: [
              'Roxy can post your score and time',
              'next to three initials you pick.',
              'No name, no account, nothing else.',
            ],
          },
          this.tick,
        );
        return drawButtonRow(
          ctx,
          layout,
          buttonRow,
          [
            { id: 'shareNo', text: 'No thanks' },
            { id: 'shareYes', text: 'Yes, post it' },
          ],
          'shareYes',
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
              // Where that score came from. The clock is the biggest part of
              // it by far, and a child who is never shown that has no reason
              // to believe hurrying is worth anything.
              ...(this.session?.bonus
                ? [`Fast finish +${this.session.bonus.timeBonus}  ·  Bones +${this.session.bonus.boneBonus}`]
                : []),
              // Only once the board has answered. Until then the panel simply
              // does not mention it, rather than promising a rank that may
              // never arrive.
              ...(this.standing ? [`World rank #${this.standing.rank}`] : []),
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
