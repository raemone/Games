/**
 * The first-run screen, plus the name/emoji/colour form that settings reuses
 * when somebody is added or edited later.
 */

import { MAX_NAME_LENGTH, PERSON_COLORS, PERSON_EMOJI, firstColor, firstEmoji } from '../core/model';
import type { Person } from '../core/model';
import type { App } from './app';
import { el } from './dom';

export interface PersonDraft {
  readonly name: string;
  readonly emoji: string;
  readonly color: string;
}

/** Name field, emoji grid and colour swatches. Used by setup and by settings. */
export class PersonForm {
  readonly root: HTMLElement;

  private readonly nameInput: HTMLInputElement;
  private emoji: string;
  private color: string;
  private readonly emojiButtons: HTMLButtonElement[] = [];
  private readonly colorButtons: HTMLButtonElement[] = [];

  constructor(existing: Person | null, private readonly onValidChange: () => void) {
    this.emoji = existing?.emoji ?? firstEmoji();
    this.color = existing?.color ?? firstColor();

    this.nameInput = el('input', {
      attrs: {
        type: 'text',
        maxlength: String(MAX_NAME_LENGTH),
        placeholder: 'Name',
        autocomplete: 'off',
        enterkeyhint: 'done',
      },
      on: { input: () => this.onValidChange() },
    });
    this.nameInput.value = existing?.name ?? '';

    const emojiGrid = el('div', { class: 'picker', attrs: { role: 'group', 'aria-label': 'Pick a picture' } });
    for (const option of PERSON_EMOJI) {
      const button = el('button', {
        class: 'pick',
        text: option,
        attrs: { type: 'button', 'aria-label': `Picture ${option}` },
        on: {
          click: () => {
            this.emoji = option;
            this.paint();
          },
        },
      });
      this.emojiButtons.push(button);
      emojiGrid.append(button);
    }

    const colorGrid = el('div', { class: 'picker', attrs: { role: 'group', 'aria-label': 'Pick a colour' } });
    PERSON_COLORS.forEach((option, index) => {
      const button = el('button', {
        class: 'swatch',
        attrs: { type: 'button', 'aria-label': `Colour ${String(index + 1)}` },
        on: {
          click: () => {
            this.color = option;
            this.paint();
          },
        },
      });
      button.style.background = option;
      this.colorButtons.push(button);
      colorGrid.append(button);
    });

    this.root = el('div', {}, [
      el('label', { class: 'field' }, [el('span', { text: 'Name' }), this.nameInput]),
      el('div', { class: 'field' }, [el('span', { text: 'Picture' }), emojiGrid]),
      el('div', { class: 'field' }, [el('span', { text: 'Colour' }), colorGrid]),
    ]);

    this.paint();
  }

  focus(): void {
    this.nameInput.focus();
  }

  isValid(): boolean {
    return this.nameInput.value.trim().length > 0;
  }

  draft(): PersonDraft {
    return { name: this.nameInput.value.trim(), emoji: this.emoji, color: this.color };
  }

  reset(): void {
    this.nameInput.value = '';
    this.nameInput.focus();
    this.onValidChange();
  }

  private paint(): void {
    this.emojiButtons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(PERSON_EMOJI[index] === this.emoji));
    });
    this.colorButtons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(PERSON_COLORS[index] === this.color));
    });
  }
}

/** Shown until at least one person exists. */
export class SetupView {
  readonly root: HTMLElement;

  private readonly form: PersonForm;
  private readonly addButton: HTMLButtonElement;
  private readonly startButton: HTMLButtonElement;
  private readonly list: HTMLElement;

  constructor(private readonly app: App) {
    this.form = new PersonForm(null, () => this.paint());

    this.addButton = el('button', {
      class: 'btn',
      text: 'Add to the patrol',
      attrs: { type: 'button' },
      on: { click: () => this.add() },
    });

    this.startButton = el('button', {
      class: 'btn primary',
      text: 'Start patrolling',
      attrs: { type: 'button' },
      on: { click: () => this.app.finishSetup() },
    });

    this.list = el('div');

    this.root = el('div', {}, [
      el('header', { class: 'topbar' }, [
        el('div', { class: 'grow' }, [
          el('h1', { text: '💩 Poop Patrol' }),
          el('p', { text: 'Who is on the patrol?' }),
        ]),
      ]),
      el('section', { class: 'card' }, [this.form.root, this.addButton]),
      el('section', { class: 'card' }, [el('h2', { text: 'The patrol' }), this.list]),
      this.startButton,
    ]);

    this.paint();
  }

  update(): void {
    this.paint();
  }

  private add(): void {
    if (!this.form.isValid()) return;
    this.app.addPerson(this.form.draft());
    this.form.reset();
  }

  private paint(): void {
    this.addButton.disabled = !this.form.isValid();

    const roster = this.app.save.people;
    this.startButton.disabled = roster.length === 0;

    this.list.replaceChildren(
      ...(roster.length === 0
        ? [el('p', { class: 'empty', text: 'Nobody yet. Add the first patroller above.' })]
        : roster.map((person) => this.buildRow(person))),
    );
  }

  private buildRow(person: Person): HTMLElement {
    const avatar = el('span', { class: 'avatar', text: person.emoji, attrs: { 'aria-hidden': 'true' } });
    avatar.style.background = person.color;

    return el('div', { class: 'roster' }, [
      avatar,
      el('div', { class: 'who' }, [el('div', { class: 'name', text: person.name })]),
      el('button', {
        class: 'mini danger',
        text: 'Remove',
        attrs: { type: 'button', 'aria-label': `Remove ${person.name}` },
        on: { click: () => this.app.deletePerson(person.id) },
      }),
    ]);
  }
}
