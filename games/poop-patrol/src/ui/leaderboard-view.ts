/**
 * The weekly board. Small enough to rebuild wholesale on every update.
 *
 * Nobody is ever labelled last: below the medals everyone who scored gets a
 * star, and a zero row just says "not yet this week".
 */

import { compareDays, startOfWeek } from '../core/dates';
import { medalFor, weekBoard } from '../core/leaderboard';
import type { LeaderRow } from '../core/leaderboard';
import type { App } from './app';
import { clear, el } from './dom';
import { poopWord, points, weekLabel } from './format';

const WEEKDAY_LETTERS: readonly string[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export class LeaderboardView {
  readonly root: HTMLElement;

  private readonly title: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly forward: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly note: HTMLElement;

  constructor(private readonly app: App) {
    this.title = el('h2');
    this.back = el('button', {
      text: '◀',
      attrs: { 'aria-label': 'Previous week' },
      on: { click: () => this.app.goWeek(-1) },
    });
    this.forward = el('button', {
      text: '▶',
      attrs: { 'aria-label': 'Next week' },
      on: { click: () => this.app.goWeek(1) },
    });

    this.note = el('p', { class: 'newweek' });
    this.note.hidden = true;
    this.body = el('div');

    this.root = el('section', { class: 'card' }, [
      el('div', { class: 'weeknav' }, [this.back, this.title, this.forward]),
      this.note,
      this.body,
    ]);
  }

  update(): void {
    const thisWeek = startOfWeek(this.app.today);
    const viewing = this.app.weekStart;

    this.title.textContent = viewing === thisWeek ? 'This week' : weekLabel(viewing);
    this.forward.disabled = compareDays(viewing, thisWeek) >= 0;

    const rows = weekBoard(this.app.save, viewing);
    const anyPoints = rows.some((row) => row.points > 0);

    // Monday morning, with a fresh board, deserves a word of encouragement
    // rather than a screen of zeroes.
    const isFreshMonday = viewing === thisWeek && this.app.today === thisWeek && !anyPoints;
    this.note.hidden = !isFreshMonday;
    if (isFreshMonday) this.note.textContent = 'New week! Everyone back to zero. 🎉';

    clear(this.body);
    if (rows.length === 0) {
      this.body.append(el('p', { class: 'empty', text: 'Add someone to start the board.' }));
      return;
    }
    for (const row of rows) this.body.append(this.buildRow(row));
  }

  private buildRow(row: LeaderRow): HTMLElement {
    const avatar = el('span', { class: 'avatar', text: row.person.emoji, attrs: { 'aria-hidden': 'true' } });
    avatar.style.background = row.person.color;

    const name = el('span', { text: row.person.name });
    const nameLine = el('div', { class: 'name' }, [name]);
    if (row.tied && row.points > 0) nameLine.append(el('span', { class: 'chip', text: 'tie' }));
    if (row.person.retired) nameLine.append(el('span', { class: 'chip', text: 'retired' }));

    const dots = el('div', { class: 'dots', attrs: { 'aria-hidden': 'true' } });
    row.days.forEach((active, index) => {
      const dot = el('i');
      dot.classList.toggle('on', active);
      dot.title = WEEKDAY_LETTERS[index] ?? '';
      dots.append(dot);
    });

    const medal = medalFor(row.rank, row.points);
    const score = el('div', { class: 'score' }, [
      el('span', { class: 'n', text: row.points > 0 ? points(row.points) : '–' }),
      el('span', {
        class: 's',
        text: row.points > 0 ? `${String(row.poops)} ${poopWord(row.poops)}` : 'not yet',
      }),
    ]);

    const line = el(
      'div',
      {
        class: row.points > 0 ? 'lead' : 'lead zero',
        // Screen readers get the placing as words; the medal emoji is decorative.
        attrs: {
          'aria-label':
            row.points > 0
              ? `${String(row.rank)}${ordinal(row.rank)} place, ${row.person.name}, ${points(row.points)} points`
              : `${row.person.name}, nothing yet this week`,
        },
      },
      [
        el('span', { class: 'medal', text: medal, attrs: { 'aria-hidden': 'true' } }),
        avatar,
        el('div', { class: 'who' }, [nameLine, dots]),
        score,
      ],
    );

    return line;
  }
}

function ordinal(rank: number): string {
  if (rank % 100 >= 11 && rank % 100 <= 13) return 'th';
  if (rank % 10 === 1) return 'st';
  if (rank % 10 === 2) return 'nd';
  if (rank % 10 === 3) return 'rd';
  return 'th';
}
