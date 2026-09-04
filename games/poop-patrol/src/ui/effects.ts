/**
 * The celebrations.
 *
 * Confetti fires on milestones only - a goal met, a badge earned, a rank up.
 * On every ordinary tap it would just become wallpaper.
 *
 * The OS preference wins over the app's own toggle: the settings switch can
 * turn motion off, never back on.
 */

import { el } from './dom';

const CONFETTI_COLORS: readonly string[] = ['#ffd88a', '#ff9ec4', '#7ec8f0', '#8ce0a8', '#c9a4ff'];
const CONFETTI_PIECES = 40;

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export class Effects {
  private confettiOn = true;
  private readonly queue: { emoji: string; name: string; blurb: string }[] = [];
  private showing = false;

  constructor(private readonly layer: HTMLElement) {}

  setConfettiEnabled(enabled: boolean): void {
    this.confettiOn = enabled;
  }

  /** A brief bump on the number that just changed. */
  pop(node: HTMLElement): void {
    node.classList.remove('pop');
    // Force a reflow so the class re-applies even on a rapid second tap.
    void node.offsetWidth;
    node.classList.add('pop');
    window.setTimeout(() => node.classList.remove('pop'), 180);
  }

  /** A poop emoji arcing up out of the button that was tapped. */
  particle(origin: HTMLElement, emoji = '💩'): void {
    if (prefersReducedMotion()) return;

    const box = origin.getBoundingClientRect();
    const node = el('span', { class: 'particle', text: emoji });
    node.style.left = `${box.left + box.width / 2}px`;
    node.style.top = `${box.top + box.height / 2}px`;

    this.layer.append(node);
    node.addEventListener('animationend', () => node.remove());
  }

  confetti(): void {
    if (!this.confettiOn || prefersReducedMotion()) return;

    for (let index = 0; index < CONFETTI_PIECES; index += 1) {
      const piece = el('span', { class: 'confetti' });
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? '#ffd88a';
      piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      piece.style.animationDelay = `${Math.random() * 0.35}s`;

      this.layer.append(piece);
      piece.addEventListener('animationend', () => piece.remove());
    }
  }

  /** Queued, so several badges landing at once are read one at a time. */
  toast(emoji: string, name: string, blurb: string): void {
    this.queue.push({ emoji, name, blurb });
    this.drainQueue();
  }

  private drainQueue(): void {
    if (this.showing) return;
    const next = this.queue.shift();
    if (!next) return;

    this.showing = true;
    const card = el('div', { class: 'toast', attrs: { role: 'status' } }, [
      el('span', { class: 'e', text: next.emoji }),
      el('div', {}, [
        el('div', { class: 'n', text: next.name }),
        el('div', { class: 'b', text: next.blurb }),
      ]),
    ]);

    const dismiss = (): void => {
      card.remove();
      this.showing = false;
      this.drainQueue();
    };

    card.addEventListener('click', dismiss);
    this.layer.append(card);
    window.setTimeout(dismiss, 3600);
  }
}
