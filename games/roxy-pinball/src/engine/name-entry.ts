/**
 * The one piece of the game that is not canvas: a real text input for the
 * player's name on the global board.
 *
 * Typing on a canvas means building a keyboard, and a hand-built keyboard on a
 * phone is worse than the one the phone already has in every way that matters -
 * no autocorrect off switch, no paste, no accents, wrong size for the thumb,
 * and invisible to a screen reader. So this is a real <input>, positioned over
 * the canvas and styled to match, shown only on the game over screen.
 */
import { NAME_MAX_LENGTH } from './leaderboard';

export type SubmitHandler = (name: string) => void;

export class NameEntry {
  private readonly root: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly button: HTMLButtonElement;
  private readonly status: HTMLParagraphElement;
  private handler: SubmitHandler | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('form');
    this.root.setAttribute('aria-label', 'Submit your score to the global board');
    // Note the display rule is not in here. An inline `display:flex` beats the
    // browser's own `[hidden] { display: none }`, so a form written that way is
    // visible no matter what `hidden` says - it sat over the playfield through
    // an entire game before anyone noticed. `hide()` sets both.
    this.root.style.cssText = [
      'position:absolute',
      'left:50%',
      'transform:translateX(-50%)',
      'width:min(300px, calc(100% - 48px))',
      'flex-direction:column',
      'gap:8px',
      'font-family:system-ui, -apple-system, "Segoe UI", sans-serif',
    ].join(';');
    this.hide();

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = NAME_MAX_LENGTH;
    this.input.placeholder = 'YOUR NAME';
    this.input.setAttribute('autocomplete', 'nickname');
    this.input.spellcheck = false;
    this.input.style.cssText = [
      'flex:1',
      'min-width:0',
      'padding:12px 14px',
      'border-radius:12px',
      'border:2px solid #402a6b',
      'background:#150c26',
      'color:#f4ecff',
      'font:inherit',
      'font-size:16px', // Anything smaller and iOS zooms the page on focus.
      'text-transform:uppercase',
    ].join(';');

    this.button = document.createElement('button');
    this.button.type = 'submit';
    this.button.textContent = 'SUBMIT';
    this.button.style.cssText = [
      'padding:12px 16px',
      'border-radius:12px',
      'border:none',
      'background:#ffd88a',
      'color:#07040f',
      'font:inherit',
      'font-size:15px',
      'font-weight:700',
      'cursor:pointer',
    ].join(';');

    this.status = document.createElement('p');
    this.status.setAttribute('role', 'status');
    this.status.style.cssText =
      'margin:0;text-align:center;font-size:13px;color:#b9a8d8;min-height:16px';

    row.append(this.input, this.button);
    this.root.append(row, this.status);
    parent.append(this.root);

    this.root.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = this.input.value.trim();
      if (!name || !this.handler) return;
      this.handler(name);
    });
  }

  /** Put it just above the button the game over screen draws on the canvas. */
  place(bottom: number): void {
    this.root.style.bottom = `${bottom}px`;
  }

  show(defaultName: string, onSubmit: SubmitHandler): void {
    this.handler = onSubmit;
    this.input.value = defaultName;
    this.setStatus('');
    this.setBusy(false);
    this.root.hidden = false;
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.hidden = true;
    this.root.style.display = 'none';
    this.handler = null;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  setBusy(busy: boolean): void {
    this.button.disabled = busy;
    this.button.style.opacity = busy ? '0.5' : '1';
    this.input.disabled = busy;
  }

  setStatus(text: string, tone: 'normal' | 'good' | 'bad' = 'normal'): void {
    this.status.textContent = text;
    this.status.style.color =
      tone === 'good' ? '#8ce0b0' : tone === 'bad' ? '#ff7a7a' : '#b9a8d8';
  }

  /** Once a score is on the board, the form has done its job. */
  collapse(): void {
    this.input.hidden = true;
    this.button.hidden = true;
  }

  reset(): void {
    this.input.hidden = false;
    this.button.hidden = false;
  }
}
