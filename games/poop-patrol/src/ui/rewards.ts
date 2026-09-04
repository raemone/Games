/**
 * The reward shop: one section per patroller, showing what their points can
 * buy and how close they are to the two big streak prizes.
 *
 * The wallet is deliberately the loudest thing on each card. It is the number a
 * child will check, and it is not the same number as the leaderboard score -
 * so the card says "to spend" to keep the two apart.
 */

import { activePeople } from '../core/model';
import type { Person } from '../core/model';
import { pointsBalance, rewardStatuses } from '../core/rewards';
import type { RewardStatus } from '../core/rewards';
import { streakFor } from '../core/streaks';
import type { App } from './app';
import { el } from './dom';
import { points, shortDate } from './format';

export function buildRewards(app: App): HTMLElement {
  const roster = activePeople(app.save.people);

  const body =
    roster.length === 0
      ? [el('p', { class: 'card empty', text: 'Nobody on the patrol yet.' })]
      : roster.map((person) => buildPersonRewards(app, person));

  return el('div', {}, [
    el('header', { class: 'topbar' }, [
      el('div', { class: 'grow' }, [
        el('h1', { text: '🎁 Rewards' }),
        el('p', { text: 'Spend points, or hold a streak' }),
      ]),
      el('button', {
        class: 'icon-btn',
        text: '✕',
        attrs: { 'aria-label': 'Close rewards' },
        on: { click: () => app.closeSheet() },
      }),
    ]),
    ...body,
    el('section', { class: 'card' }, [
      el('h2', { text: 'How it works' }),
      el('p', {
        class: 'empty',
        text: 'Every poop is 10 points, plus a streak bonus. Points buy the first three rewards over and over - spending them never costs you your place on the leaderboard. The last two are not for sale: they need a streak that long, and they can only be won once.',
      }),
    ]),
  ]);
}

function buildPersonRewards(app: App, person: Person): HTMLElement {
  const balance = pointsBalance(app.save, person.id);
  const streak = streakFor(app.save.log, person.id, app.today);
  const statuses = rewardStatuses(app.save, person.id, app.today);

  const avatar = el('span', { class: 'avatar', text: person.emoji, attrs: { 'aria-hidden': 'true' } });
  avatar.style.background = person.color;

  const header = el('div', { class: 'wallet' }, [
    avatar,
    el('div', { class: 'who' }, [
      el('div', { class: 'name', text: person.name }),
      el('div', { class: 'meta', text: `🔥 ${String(streak.length)}-day streak` }),
    ]),
    el('div', { class: 'balance' }, [
      el('span', { class: 'n', text: points(balance) }),
      el('span', { class: 'l', text: 'to spend' }),
    ]),
  ]);

  return el('section', { class: 'card' }, [
    header,
    ...statuses.map((status) => buildRewardRow(app, person, status)),
  ]);
}

function buildRewardRow(app: App, person: Person, status: RewardStatus): HTMLElement {
  const { reward, state } = status;

  const requirement =
    reward.kind === 'points'
      ? `${points(status.price)} pts`
      : `🔥 ${String(reward.streakDays)} days`;

  const detail = detailLine(status);

  const action =
    state === 'ready'
      ? el('button', {
          class: 'mini claim',
          text: 'Claim',
          attrs: { type: 'button', 'aria-label': `Claim ${reward.name} for ${person.name}` },
          on: { click: () => app.claimReward(person, reward.id) },
        })
      : state === 'claimed'
        ? el('button', {
            class: 'mini',
            text: 'Undo',
            attrs: { type: 'button', 'aria-label': `Undo ${reward.name} for ${person.name}` },
            on: { click: () => app.unclaimReward(person, reward.id) },
          })
        : el('span', { class: 'mini locked', text: requirement });

  const row = el(
    'div',
    { class: state === 'locked' ? 'reward locked' : `reward ${state}` },
    [
      el('span', { class: 'e', text: reward.emoji, attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'who' }, [
        el('div', { class: 'name', text: reward.name }),
        el('div', { class: 'meta', text: detail }),
      ]),
      action,
    ],
  );

  return row;
}

function detailLine(status: RewardStatus): string {
  const { reward, state } = status;

  if (reward.kind === 'points') {
    if (state === 'ready') {
      const spare = status.balance - status.price;
      return spare > 0
        ? `${points(status.price)} pts · ${points(spare)} left over`
        : `${points(status.price)} pts · exactly enough`;
    }
    return `${points(status.price)} pts · ${points(status.shortBy)} to go`;
  }

  if (state === 'claimed') {
    return status.lastClaimed ? `Won on ${shortDate(status.lastClaimed)}` : 'Won';
  }
  if (state === 'ready') return `${String(reward.streakDays)} days reached. Once ever.`;
  return `Best streak ${String(status.streak)} · ${String(status.daysToGo)} days to go`;
}
