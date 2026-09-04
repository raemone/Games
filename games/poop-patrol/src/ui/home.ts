/**
 * The main screen.
 *
 * Structure (the day chips and the person rows) is built once and rebuilt only
 * when the roster, the run of days or today itself changes. Everything that
 * moves on a tap - counts, points, streaks, the goal bar, the board - is
 * patched in place. That keeps CSS transitions alive and, more importantly,
 * never yanks focus out of the inline number input somebody is typing into.
 */

import { lastNDays } from '../core/dates';
import type { DayKey } from '../core/dates';
import { MAX_PER_DAY, activePeople, countFor, dayTotal } from '../core/model';
import type { Person } from '../core/model';
import { emptyLine, goalLine, roxyMood } from '../core/quips';
import { familyGoalProgress, scoreDay } from '../core/scoring';
import { streakFor } from '../core/streaks';
import type { App } from './app';
import { clear, el, show } from './dom';
import { dayNumber, longDate, poopWord, points, shortDate, weekdayLetter } from './format';
import { LeaderboardView } from './leaderboard-view';

interface PersonRow {
  readonly root: HTMLElement;
  readonly count: HTMLButtonElement;
  readonly input: HTMLInputElement;
  readonly minus: HTMLButtonElement;
  readonly flame: HTMLElement;
  readonly score: HTMLElement;
}

export class HomeView {
  readonly root: HTMLElement;

  private signature = '';
  private readonly strip: HTMLElement;
  private readonly jump: HTMLElement;
  private readonly jumpInput: HTMLInputElement;
  private readonly banner: HTMLElement;
  private readonly bannerText: HTMLElement;
  private readonly roxyFace: HTMLElement;
  private readonly roxyLine: HTMLElement;
  private readonly roxySub: HTMLElement;
  private readonly goal: HTMLElement;
  private readonly goalCount: HTMLElement;
  private readonly goalNote: HTMLElement;
  private readonly goalFill: HTMLElement;
  private readonly people: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly board: LeaderboardView;
  private readonly chips = new Map<DayKey, HTMLElement>();
  private scrolledTo: DayKey | null = null;
  private readonly rows = new Map<string, PersonRow>();

  constructor(private readonly app: App) {
    this.strip = el('div', { class: 'daystrip', attrs: { role: 'group', 'aria-label': 'Pick a day' } });

    this.jumpInput = el('input', {
      attrs: { type: 'date', 'aria-label': 'Jump to a day' },
      on: {
        change: () => {
          const value = this.jumpInput.value;
          if (value) this.app.selectDay(value);
        },
      },
    });
    this.jump = el('label', { class: 'field' }, [
      el('span', { text: 'Jump to a day' }),
      this.jumpInput,
    ]);
    this.jump.hidden = true;

    this.bannerText = el('span');
    this.banner = el('div', { class: 'banner' }, [
      this.bannerText,
      el('button', { text: 'Back to today', on: { click: () => this.app.selectDay(this.app.today) } }),
    ]);
    this.banner.hidden = true;

    this.roxyFace = el('span', { class: 'face' });
    this.roxyLine = el('div', { class: 'line' });
    this.roxySub = el('div', { class: 'sub' });
    const roxyCard = el('section', { class: 'card roxy' }, [
      this.roxyFace,
      el('div', {}, [this.roxyLine, this.roxySub]),
    ]);

    this.goalCount = el('strong');
    this.goalNote = el('span', { class: 'note' });
    this.goalFill = el('i');
    this.goal = el('section', { class: 'card goal' }, [
      el('div', { class: 'row' }, [
        this.goalCount,
        el('span', { class: 'grow', text: 'this week' }),
        this.goalNote,
      ]),
      el('div', { class: 'bar' }, [this.goalFill]),
    ]);

    this.people = el('div', { class: 'people' });
    this.board = new LeaderboardView(app);
    this.foot = el('p', { class: 'foot' });

    this.root = el('div', {}, [
      this.buildTopBar(),
      this.strip,
      this.jump,
      this.banner,
      roxyCard,
      this.goal,
      this.people,
      this.board.root,
      this.foot,
    ]);
  }

  private buildTopBar(): HTMLElement {
    return el('header', { class: 'topbar' }, [
      el('div', { class: 'grow' }, [
        el('h1', { text: '💩 Poop Patrol' }),
        el('p', { class: 'dogline', text: '' }),
      ]),
      el('button', {
        class: 'icon-btn',
        text: '📅',
        attrs: { 'aria-label': 'Jump to a day' },
        on: {
          click: () => {
            this.jump.hidden = !this.jump.hidden;
            if (!this.jump.hidden) this.jumpInput.focus();
          },
        },
      }),
      el('button', {
        class: 'icon-btn',
        text: '⚙️',
        attrs: { 'aria-label': 'Settings and roster' },
        on: { click: () => this.app.openSettings() },
      }),
    ]);
  }

  update(): void {
    const wanted = this.structureSignature();
    if (wanted !== this.signature) {
      this.signature = wanted;
      this.buildStrip();
      this.buildPeople();
      this.scrolledTo = null;
    }

    this.patchTopBar();
    this.patchStrip();
    this.patchBanner();
    this.patchRoxy();
    this.patchGoal();
    this.patchPeople();
    this.board.update();
    this.patchFoot();
  }

  /** What forces a structural rebuild, as opposed to a value patch. */
  private structureSignature(): string {
    const roster = this.app.save.people
      .map((person) => `${person.id}:${person.name}:${person.emoji}:${person.color}:${String(person.retired)}`)
      .join('|');
    return `${roster}#${this.app.today}#${String(this.app.stripDays)}`;
  }

  private buildStrip(): void {
    clear(this.strip);
    this.chips.clear();

    this.strip.append(
      el('button', {
        class: 'strip-more',
        text: '◀ more',
        attrs: { 'aria-label': 'Show two more weeks' },
        on: { click: () => this.app.showMoreDays() },
      }),
    );

    for (const day of lastNDays(this.app.today, this.app.stripDays)) {
      const chip = el(
        'button',
        {
          class: 'day',
          attrs: { 'aria-label': longDate(day) },
          on: { click: () => this.app.selectDay(day) },
        },
        [
          el('span', { class: 'dow', text: weekdayLetter(day) }),
          el('span', { class: 'num', text: dayNumber(day) }),
          el('span', { class: 'tally' }),
        ],
      );
      this.chips.set(day, chip);
      this.strip.append(chip);
    }
  }

  private buildPeople(): void {
    clear(this.people);
    this.rows.clear();

    const roster = activePeople(this.app.save.people);
    if (roster.length === 0) {
      this.people.append(
        el('p', { class: 'card empty', text: 'Nobody on the patrol yet. Add someone in settings.' }),
      );
      return;
    }

    for (const person of roster) {
      const row = this.buildPersonRow(person);
      this.rows.set(person.id, row);
      this.people.append(row.root);
    }
  }

  private buildPersonRow(person: Person): PersonRow {
    const avatar = el('button', {
      class: 'avatar',
      text: person.emoji,
      attrs: { 'aria-label': `${person.name}'s trophy case` },
      on: { click: () => this.app.openTrophies(person.id) },
    });
    avatar.style.background = person.color;

    const flame = el('span', { class: 'flame' });
    const score = el('span');

    const count = el('button', {
      class: 'count',
      on: { click: () => this.startEditing(person.id) },
    });

    const input = el('input', {
      class: 'count-input',
      attrs: { type: 'number', min: '0', max: String(MAX_PER_DAY), inputmode: 'numeric' },
      on: {
        keydown: (event) => {
          if (!(event instanceof KeyboardEvent)) return;
          if (event.key === 'Enter') input.blur();
          if (event.key === 'Escape') {
            input.dataset.cancelled = 'yes';
            input.blur();
          }
        },
        blur: () => this.commitEditing(person, input, count),
      },
    });
    input.hidden = true;

    const minus = el('button', {
      class: 'step minus',
      text: '−',
      attrs: { 'aria-label': `Remove one for ${person.name}` },
      on: { click: () => this.app.adjust(person, -1) },
    });

    const plus = el('button', {
      class: 'step plus',
      text: '+',
      attrs: { 'aria-label': `Add one for ${person.name}` },
      on: { click: (event) => this.app.adjust(person, 1, event.currentTarget as HTMLElement) },
    });

    const root = el('section', { class: 'card person' }, [
      avatar,
      el('div', { class: 'who' }, [
        el('div', { class: 'name', text: person.name }),
        el('div', { class: 'meta' }, [flame, score]),
      ]),
      el('div', { class: 'stepper' }, [minus, count, input, plus]),
    ]);

    return { root, count, input, minus, flame, score };
  }

  private startEditing(personId: string): void {
    const row = this.rows.get(personId);
    if (!row) return;

    row.input.value = String(countFor(this.app.save.log, this.app.selectedDay, personId));
    show(row.count, false);
    show(row.input, true);
    row.input.focus();
    row.input.select();
  }

  private commitEditing(person: Person, input: HTMLInputElement, count: HTMLButtonElement): void {
    show(input, false);
    show(count, true);

    if (input.dataset.cancelled === 'yes') {
      delete input.dataset.cancelled;
      return;
    }

    const typed = Number(input.value);
    if (!Number.isFinite(typed)) return;
    this.app.setCount(person, typed);
  }

  private patchTopBar(): void {
    const line = this.root.querySelector<HTMLElement>('.dogline');
    if (line) line.textContent = `${this.app.save.settings.dogName}'s backyard`;
  }

  private patchStrip(): void {
    for (const [day, chip] of this.chips) {
      const total = dayTotal(this.app.save.log, day);
      chip.classList.toggle('selected', day === this.app.selectedDay);
      chip.classList.toggle('today', day === this.app.today);
      chip.classList.toggle('has', total > 0);
      chip.setAttribute('aria-pressed', String(day === this.app.selectedDay));

      const tally = chip.querySelector<HTMLElement>('.tally');
      if (tally) tally.textContent = total > 0 ? `💩${total}` : '';
    }

    this.jumpInput.max = this.app.today;
    this.jumpInput.value = this.app.selectedDay;

    // Bring the selected day into view when it changes, but never on an
    // ordinary count patch - that would yank the strip back while somebody is
    // scrolling through it.
    if (this.scrolledTo !== this.app.selectedDay) {
      this.scrolledTo = this.app.selectedDay;
      const chip = this.chips.get(this.app.selectedDay);
      if (chip) {
        // Set scrollLeft directly rather than scrollIntoView, which would also
        // scroll the page.
        this.strip.scrollLeft = chip.offsetLeft - this.strip.clientWidth / 2 + chip.offsetWidth / 2;
      }
    }
  }

  private patchBanner(): void {
    const browsing = this.app.selectedDay !== this.app.today;
    show(this.banner, browsing);
    if (browsing) {
      this.bannerText.textContent = `Logging for ${shortDate(this.app.selectedDay)}`;
    }
  }

  private patchRoxy(): void {
    const total = dayTotal(this.app.save.log, this.app.selectedDay);
    const mood = roxyMood(total, this.app.save.settings.dogName);

    this.roxyFace.textContent = mood.emoji;
    this.roxyLine.textContent = total > 0 ? mood.line : emptyLine(this.app.selectedDay);
    this.roxySub.textContent =
      total > 0
        ? `${String(total)} ${poopWord(total)} on ${shortDate(this.app.selectedDay)}`
        : `Nothing logged for ${shortDate(this.app.selectedDay)}`;
  }

  private patchGoal(): void {
    const progress = familyGoalProgress(
      this.app.save.log,
      this.app.weekStart,
      this.app.save.settings.weeklyGoal,
    );

    this.goalCount.textContent = `${String(progress.picked)} / ${String(progress.goal)}`;
    this.goalNote.textContent = goalLine(progress.picked, progress.goal);
    this.goalFill.style.width = `${String(Math.round(progress.fraction * 100))}%`;
    this.goal.classList.toggle('met', progress.met);
  }

  private patchPeople(): void {
    for (const person of activePeople(this.app.save.people)) {
      const row = this.rows.get(person.id);
      if (!row) continue;

      const score = scoreDay(this.app.save.log, person.id, this.app.selectedDay);
      row.count.textContent = String(score.count);
      row.count.setAttribute(
        'aria-label',
        `${person.name} picked up ${String(score.count)}. Tap to type a number.`,
      );
      row.minus.disabled = score.count <= 0;

      // The flame always reports TODAY, even while browsing an earlier day -
      // the count beside it is the selected day's, and the banner says so.
      const streak = streakFor(this.app.save.log, person.id, this.app.today);
      row.flame.textContent = streak.length > 0 ? `🔥 ${String(streak.length)}` : '🔥 0';
      row.flame.className = `flame ${streak.status === 'active' ? 'lit' : streak.status === 'atRisk' ? 'risk' : ''}`;
      row.flame.title =
        streak.status === 'atRisk' ? 'Still alive - log one today!' : `${String(streak.length)}-day streak`;

      const bonus = score.bonusPoints > 0 ? ` (+${String(score.bonusPoints)} streak)` : '';
      row.score.textContent = score.count > 0 ? `· ${points(score.points)} pts${bonus}` : '';
    }
  }

  private patchFoot(): void {
    const total = Object.keys(this.app.save.log).reduce(
      (sum, day) => sum + dayTotal(this.app.save.log, day),
      0,
    );
    this.foot.textContent =
      total > 0 ? `${points(total)} ${poopWord(total)} collected, all time` : 'Nothing collected yet.';
  }

  /** Bump the number that just changed, without the app poking at the DOM. */
  popCount(personId: string, effects: { pop(node: HTMLElement): void }): void {
    const row = this.rows.get(personId);
    if (row) effects.pop(row.count);
  }
}
