/**
 * Settings and the roster.
 *
 * Removal is two different things and the wording says so: retiring keeps
 * somebody's history (so past weeks and family totals stay honest), deleting
 * erases it. Only the second one asks for confirmation.
 *
 * Export exists from day one rather than "later": on a browser that is not
 * installed to the home screen, an unused fortnight can quietly take the whole
 * history with it.
 */

import {
  MAX_NAME_LENGTH,
  MAX_PEOPLE,
  MAX_WEEKLY_GOAL,
  MIN_WEEKLY_GOAL,
  personById,
} from '../core/model';
import type { Person, PersonId } from '../core/model';
import { exportJson } from '../core/storage';
import type { App } from './app';
import { el } from './dom';
import { PersonForm } from './setup';

export function buildSettings(app: App, editing: PersonId | null): HTMLElement {
  const settings = app.save.settings;

  const goalInput = el('input', {
    attrs: {
      type: 'number',
      min: String(MIN_WEEKLY_GOAL),
      max: String(MAX_WEEKLY_GOAL),
      inputmode: 'numeric',
    },
    on: {
      change: () => app.updateSettings({ ...app.save.settings, weeklyGoal: Number(goalInput.value) }),
    },
  });
  goalInput.value = String(settings.weeklyGoal);

  const dogInput = el('input', {
    attrs: { type: 'text', maxlength: String(MAX_NAME_LENGTH), autocomplete: 'off' },
    on: {
      change: () => app.updateSettings({ ...app.save.settings, dogName: dogInput.value }),
    },
  });
  dogInput.value = settings.dogName;

  const roster = el('div');
  for (const person of app.save.people) roster.append(buildRosterRow(app, person, editing));
  if (app.save.people.length === 0) {
    roster.append(el('p', { class: 'empty', text: 'Nobody on the patrol.' }));
  }

  const addSection = editing === null ? buildAddSection(app) : buildEditSection(app, editing);

  return el('div', {}, [
    el('header', { class: 'topbar' }, [
      el('div', { class: 'grow' }, [el('h1', { text: 'Settings' })]),
      el('button', {
        class: 'icon-btn',
        text: '✕',
        attrs: { 'aria-label': 'Close settings' },
        on: { click: () => app.closeSheet() },
      }),
    ]),

    el('section', { class: 'card' }, [el('h2', { text: 'The patrol' }), roster]),
    addSection,

    el('section', { class: 'card' }, [
      el('h2', { text: 'The yard' }),
      el('label', { class: 'field' }, [el('span', { text: "Dog's name" }), dogInput]),
      el('label', { class: 'field' }, [
        el('span', { text: 'Weekly family goal (pickups)' }),
        goalInput,
      ]),
    ]),

    el('section', { class: 'card' }, [
      el('h2', { text: 'Noise and sparkle' }),
      toggle(app, 'Sound effects', settings.soundOn, (value) =>
        app.updateSettings({ ...app.save.settings, soundOn: value }),
      ),
      toggle(app, 'Confetti', settings.confettiOn, (value) =>
        app.updateSettings({ ...app.save.settings, confettiOn: value }),
      ),
      el('p', {
        class: 'empty',
        text: 'Your device’s reduced-motion setting always wins over these.',
      }),
    ]),

    buildBackupSection(app),

    el('section', { class: 'card' }, [
      el('h2', { text: 'Scoring' }),
      el('p', {
        class: 'empty',
        text:
          'Every poop is 10 points. Come back two days in a row and you get a bonus that grows by 5 each day, up to +25. A streak stays alive as long as the last day logged is today or yesterday.',
      }),
    ]),
  ]);
}

function buildRosterRow(app: App, person: Person, editing: PersonId | null): HTMLElement {
  const avatar = el('span', { class: 'avatar', text: person.emoji, attrs: { 'aria-hidden': 'true' } });
  avatar.style.background = person.color;

  const name = el('div', { class: 'name', text: person.name });
  const line = el('div', { class: 'who' }, [name]);
  if (person.retired) line.append(el('div', { class: 'meta', text: 'Retired - history kept' }));

  return el('div', { class: 'roster' }, [
    avatar,
    line,
    el('button', {
      class: 'mini',
      text: editing === person.id ? 'Editing' : 'Edit',
      attrs: { type: 'button', 'aria-label': `Edit ${person.name}` },
      on: { click: () => app.editPerson(person.id) },
    }),
    el('button', {
      class: 'mini',
      text: person.retired ? 'Bring back' : 'Retire',
      attrs: { type: 'button', 'aria-label': `${person.retired ? 'Bring back' : 'Retire'} ${person.name}` },
      on: { click: () => app.retirePerson(person.id, !person.retired) },
    }),
    el('button', {
      class: 'mini danger',
      text: 'Delete',
      attrs: { type: 'button', 'aria-label': `Delete ${person.name} and their history` },
      on: { click: () => app.confirmDeletePerson(person) },
    }),
  ]);
}

function buildAddSection(app: App): HTMLElement {
  if (app.save.people.length >= MAX_PEOPLE) {
    return el('section', { class: 'card' }, [
      el('p', { class: 'empty', text: `That is the maximum of ${String(MAX_PEOPLE)} patrollers.` }),
    ]);
  }

  const button = el('button', { class: 'btn', text: 'Add to the patrol', attrs: { type: 'button' } });
  const form = new PersonForm(null, () => {
    button.disabled = !form.isValid();
  });
  button.disabled = true;
  button.addEventListener('click', () => {
    if (!form.isValid()) return;
    app.addPerson(form.draft());
  });

  return el('section', { class: 'card' }, [el('h2', { text: 'Add someone' }), form.root, button]);
}

function buildEditSection(app: App, personId: PersonId): HTMLElement {
  const person = personById(app.save.people, personId);
  if (!person) return el('div');

  const save = el('button', { class: 'btn primary', text: 'Save changes', attrs: { type: 'button' } });
  const form = new PersonForm(person, () => {
    save.disabled = !form.isValid();
  });
  save.addEventListener('click', () => {
    if (!form.isValid()) return;
    app.savePersonEdit(personId, form.draft());
  });

  return el('section', { class: 'card' }, [
    el('h2', { text: `Editing ${person.name}` }),
    form.root,
    el('div', { class: 'btn-row' }, [
      save,
      el('button', {
        class: 'btn',
        text: 'Cancel',
        attrs: { type: 'button' },
        on: { click: () => app.editPerson(null) },
      }),
    ]),
  ]);
}

function buildBackupSection(app: App): HTMLElement {
  const area = el('textarea', { attrs: { 'aria-label': 'Backup data', spellcheck: 'false' } });
  area.value = exportJson(app.save);

  const status = el('p', { class: 'empty', text: '' });

  const copy = el('button', {
    class: 'btn',
    text: 'Copy backup',
    attrs: { type: 'button' },
    on: {
      click: () => {
        area.focus();
        area.select();
        void navigator.clipboard
          ?.writeText(area.value)
          .then(() => {
            status.textContent = 'Copied. Paste it somewhere safe.';
          })
          .catch(() => {
            status.textContent = 'Could not copy - the text is selected, copy it by hand.';
          });
      },
    },
  });

  const restore = el('button', {
    class: 'btn',
    text: 'Restore from this text',
    attrs: { type: 'button' },
    on: { click: () => app.importBackup(area.value) },
  });

  return el('section', { class: 'card' }, [
    el('h2', { text: 'Backup' }),
    el('p', {
      class: 'empty',
      text: 'Everything lives on this device only. Copy this text somewhere safe now and then - clearing the browser would take the streaks with it.',
    }),
    el('label', { class: 'field' }, [area]),
    el('div', { class: 'btn-row' }, [copy, restore]),
    status,
    el('button', {
      class: 'btn danger',
      text: 'Erase everything',
      attrs: { type: 'button' },
      on: { click: () => app.confirmEraseAll() },
    }),
  ]);
}

function toggle(app: App, label: string, on: boolean, onChange: (value: boolean) => void): HTMLElement {
  const box = el('span', { class: 'box', text: on ? '✓' : '' });
  const button = el(
    'button',
    {
      class: 'toggle',
      attrs: { type: 'button', 'aria-pressed': String(on) },
      on: {
        click: () => {
          onChange(!on);
          app.announce(`${label} ${on ? 'off' : 'on'}`);
        },
      },
    },
    [el('span', { class: 'grow', text: label }), box],
  );
  return button;
}
