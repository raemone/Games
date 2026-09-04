/**
 * The form a parent fills in to add or change a reward. Used twice by the
 * settings screen: once to add, once inline when editing an existing one.
 */

import { MAX_REWARD_BLURB, MAX_REWARD_NAME, REWARD_EMOJI, firstRewardEmoji } from '../core/model';
import type { Reward, RewardKind } from '../core/model';
import { MAX_PRICE, MAX_STREAK_DAYS, MIN_PRICE, MIN_STREAK_DAYS } from '../core/rewards';
import type { RewardDraft } from '../core/reducer';
import { el, show } from './dom';

const DEFAULT_PRICE = 100;
const DEFAULT_STREAK_DAYS = 30;

export class RewardForm {
  readonly root: HTMLElement;

  private kind: RewardKind;
  private emoji: string;
  private readonly nameInput: HTMLInputElement;
  private readonly blurbInput: HTMLInputElement;
  private readonly priceInput: HTMLInputElement;
  private readonly streakInput: HTMLInputElement;
  private readonly priceField: HTMLElement;
  private readonly streakField: HTMLElement;
  private readonly emojiButtons: HTMLButtonElement[] = [];
  private readonly kindButtons: HTMLButtonElement[] = [];

  constructor(existing: Reward | null, private readonly onChange: () => void) {
    this.kind = existing?.kind ?? 'points';
    this.emoji = existing?.emoji ?? firstRewardEmoji();

    this.nameInput = el('input', {
      attrs: {
        type: 'text',
        maxlength: String(MAX_REWARD_NAME),
        placeholder: 'What they get',
        autocomplete: 'off',
      },
      on: { input: () => this.onChange() },
    });
    this.nameInput.value = existing?.name ?? '';

    this.blurbInput = el('input', {
      attrs: {
        type: 'text',
        maxlength: String(MAX_REWARD_BLURB),
        placeholder: 'A line of detail (optional)',
        autocomplete: 'off',
      },
    });
    this.blurbInput.value = existing?.blurb ?? '';

    this.priceInput = el('input', {
      attrs: {
        type: 'number',
        min: String(MIN_PRICE),
        max: String(MAX_PRICE),
        inputmode: 'numeric',
        'aria-label': 'Price in points',
      },
      on: { input: () => this.onChange() },
    });
    this.priceInput.value = String(existing?.kind === 'points' ? existing.price : DEFAULT_PRICE);

    this.streakInput = el('input', {
      attrs: {
        type: 'number',
        min: String(MIN_STREAK_DAYS),
        max: String(MAX_STREAK_DAYS),
        inputmode: 'numeric',
        'aria-label': 'Streak needed, in days',
      },
      on: { input: () => this.onChange() },
    });
    this.streakInput.value = String(
      existing?.kind === 'streak' ? existing.streakDays : DEFAULT_STREAK_DAYS,
    );

    this.priceField = el('label', { class: 'field' }, [
      el('span', { text: 'Price in points' }),
      this.priceInput,
    ]);
    this.streakField = el('label', { class: 'field' }, [
      el('span', { text: 'Streak needed, in days' }),
      this.streakInput,
    ]);

    this.root = el('div', {}, [
      el('label', { class: 'field' }, [el('span', { text: 'Reward' }), this.nameInput]),
      el('label', { class: 'field' }, [el('span', { text: 'Detail' }), this.blurbInput]),
      el('div', { class: 'field' }, [el('span', { text: 'Icon' }), this.buildEmojiGrid()]),
      el('div', { class: 'field' }, [el('span', { text: 'How it is earned' }), this.buildKindPicker()]),
      this.priceField,
      this.streakField,
    ]);

    this.paint();
  }

  private buildEmojiGrid(): HTMLElement {
    const grid = el('div', { class: 'picker', attrs: { role: 'group', 'aria-label': 'Pick an icon' } });
    for (const option of REWARD_EMOJI) {
      const button = el('button', {
        class: 'pick',
        text: option,
        attrs: { type: 'button', 'aria-label': `Icon ${option}` },
        on: {
          click: () => {
            this.emoji = option;
            this.paint();
          },
        },
      });
      this.emojiButtons.push(button);
      grid.append(button);
    }
    return grid;
  }

  private buildKindPicker(): HTMLElement {
    const options: readonly (readonly [RewardKind, string])[] = [
      ['points', 'Bought with points'],
      ['streak', 'Won with a streak'],
    ];

    const group = el('div', { class: 'kind-picker', attrs: { role: 'group' } });
    for (const [kind, label] of options) {
      const button = el('button', {
        class: 'kind',
        text: label,
        attrs: { type: 'button' },
        on: {
          click: () => {
            this.kind = kind;
            this.paint();
            this.onChange();
          },
        },
      });
      button.dataset.kind = kind;
      this.kindButtons.push(button);
      group.append(button);
    }
    return group;
  }

  focus(): void {
    this.nameInput.focus();
  }

  isValid(): boolean {
    if (this.nameInput.value.trim().length === 0) return false;
    const amount = Number(this.kind === 'points' ? this.priceInput.value : this.streakInput.value);
    return Number.isFinite(amount) && amount > 0;
  }

  draft(): RewardDraft {
    return {
      emoji: this.emoji,
      name: this.nameInput.value.trim(),
      blurb: this.blurbInput.value.trim(),
      kind: this.kind,
      price: Number(this.priceInput.value),
      streakDays: Number(this.streakInput.value),
    };
  }

  reset(): void {
    this.nameInput.value = '';
    this.blurbInput.value = '';
    this.nameInput.focus();
    this.onChange();
  }

  private paint(): void {
    this.emojiButtons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(REWARD_EMOJI[index] === this.emoji));
    });
    for (const button of this.kindButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.kind === this.kind));
    }
    // Only the field that applies to the chosen kind is on screen, so there is
    // never a price and a streak sitting side by side.
    show(this.priceField, this.kind === 'points');
    show(this.streakField, this.kind === 'streak');
  }
}
