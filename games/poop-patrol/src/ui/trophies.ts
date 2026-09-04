/**
 * One person's trophy case: their rank, their badges (locked ones included -
 * knowing what to aim for is half the fun) and a month of daily history.
 */

import { BADGES, earnedBadgeIds } from '../core/badges';
import { lastNDays } from '../core/dates';
import { countFor, personById } from '../core/model';
import type { PersonId } from '../core/model';
import { nextRank, rankFor } from '../core/ranks';
import { careerPoints, careerPoops } from '../core/scoring';
import { bestStreak } from '../core/streaks';
import type { App } from './app';
import { el } from './dom';
import { longDate, poopWord, points } from './format';

const HISTORY_DAYS = 30;

export function buildTrophies(app: App, personId: PersonId): HTMLElement {
  const person = personById(app.save.people, personId);
  if (!person) return el('p', { class: 'empty', text: 'That patroller is no longer here.' });

  const career = careerPoints(app.save.log, personId);
  const poops = careerPoops(app.save.log, personId);
  const rank = rankFor(career);
  const upcoming = nextRank(career);
  const earned = earnedBadgeIds(app.save, personId, app.today);

  const avatar = el('span', { class: 'avatar', text: person.emoji, attrs: { 'aria-hidden': 'true' } });
  avatar.style.background = person.color;

  const progress = el('i');
  const bar = el('div', { class: 'bar' }, [progress]);
  if (upcoming) {
    const floor = rank.minPoints;
    const span = Math.max(1, upcoming.rank.minPoints - floor);
    progress.style.width = `${String(Math.round(((career - floor) / span) * 100))}%`;
  } else {
    progress.style.width = '100%';
  }

  const rankCard = el('section', { class: 'card rankcard' }, [
    el('div', { class: 'big', text: rank.emoji }),
    el('div', { class: 'title', text: rank.title }),
    el('div', { class: 'sub', text: `${points(career)} points, all time` }),
    bar,
    el('p', {
      class: 'togo',
      text: upcoming
        ? `${points(upcoming.pointsToGo)} points to ${upcoming.rank.title}`
        : 'Top of the ladder. Nothing left to prove.',
    }),
  ]);

  const stats = el('section', { class: 'card stats' }, [
    stat(String(poops), poopWord(poops)),
    stat(String(bestStreak(app.save.log, personId, app.today)), 'best streak'),
    stat(String(earned.size), `of ${String(BADGES.length)} badges`),
  ]);

  const badgeGrid = el('div', { class: 'badges' });
  for (const badge of BADGES) {
    const has = earned.has(badge.id);
    badgeGrid.append(
      el('div', { class: has ? 'badge' : 'badge locked' }, [
        el('div', { class: 'e', text: badge.emoji }),
        el('div', { class: 'n', text: badge.name }),
        el('div', { class: 'b', text: badge.blurb }),
      ]),
    );
  }

  const history = el('div', { class: 'history' });
  for (const day of lastNDays(app.today, HISTORY_DAYS)) {
    const count = countFor(app.save.log, day, personId);
    const cell = el('i', {
      attrs: {
        'data-level': String(level(count)),
        title: `${longDate(day)}: ${String(count)} ${poopWord(count)}`,
      },
    });
    history.append(cell);
  }

  return el('div', {}, [
    el('header', { class: 'topbar' }, [
      avatar,
      el('div', { class: 'grow' }, [
        el('h1', { text: person.name }),
        el('p', { text: 'Trophy case' }),
      ]),
      el('button', {
        class: 'icon-btn',
        text: '✕',
        attrs: { 'aria-label': 'Close' },
        on: { click: () => app.closeSheet() },
      }),
    ]),
    rankCard,
    stats,
    el('section', { class: 'card' }, [el('h2', { text: 'Badges' }), badgeGrid]),
    el('section', { class: 'card' }, [el('h2', { text: 'Last 30 days' }), history]),
  ]);
}

function stat(value: string, label: string): HTMLElement {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'n', text: value }),
    el('div', { class: 'l', text: label }),
  ]);
}

function level(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  return 3;
}
