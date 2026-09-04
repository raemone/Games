/**
 * What the work actually buys.
 *
 * The list itself lives in the save, not in this file: the family adds their
 * own rewards and re-prices them, so the constants here are only the set a
 * brand-new save starts with.
 *
 * Two kinds, on purpose:
 *
 *   - POINTS rewards are bought, over and over. Points scale with how many
 *     were actually picked up, so a big clean-up is worth more than a token
 *     one, which a pure streak gate could never express.
 *   - DAYS rewards are won once in a lifetime, measured against the number of
 *     days that person has picked something up IN TOTAL, not in a row. A
 *     family that travels cannot hold a hundred-day run, and gating the big
 *     prizes on one would mean nobody ever won them. Days accumulate instead,
 *     so a fortnight away costs progress but never destroys it.
 *
 * The critical distinction is between points EARNED and points SPENT. Earned
 * points are the score: they drive the weekly leaderboard and the career rank
 * and they never go down. The balance is earned minus spent, and that is what
 * the shop charges. If redeeming a lunch cost somebody their place on the
 * leaderboard, the sensible move would be to never redeem anything.
 *
 * Claims are the one thing here that is stored rather than derived: handing
 * over a lunch is an event in the world, and no amount of reading the log can
 * tell you whether it happened. Each claim records what it actually cost, so
 * re-pricing a reward later never rewrites the past.
 */

import type { DayKey } from './dates';
import { daysPickedUp } from './model';
import type { Claim, PersonId, Reward, SaveData } from './model';
import { careerPoints } from './scoring';

export type RewardState = 'locked' | 'ready' | 'claimed';

export interface RewardStatus {
  readonly reward: Reward;
  readonly state: RewardState;
  /** Points rewards: the price, and how the balance compares. */
  readonly price: number;
  readonly balance: number;
  readonly shortBy: number;
  /** Days rewards: days picked up so far, and how many are still to go. */
  readonly daysDone: number;
  readonly daysToGo: number;
  readonly lastClaimed: DayKey | null;
  readonly timesClaimed: number;
}

export const MIN_PRICE = 1;
export const MAX_PRICE = 100_000;
export const MIN_DAYS_NEEDED = 1;
export const MAX_DAYS_NEEDED = 1000;

/**
 * What a new save starts with, agreed with the family. Prices are calibrated
 * against what the scoring really pays: with a streak going a child earns
 * roughly 170 points a week at one pickup a day and 310 at three. So screen
 * time lands every few days, lunch is a fortnight's work and MPB is a monthly
 * treat - and a single day of pickups, worth 10 to 30 points, buys nothing.
 */
export const DEFAULT_REWARDS: readonly Reward[] = [
  {
    id: 'screen-hour',
    emoji: '📺',
    name: '1 hour of screen time',
    blurb: 'TV, Switch or tablet - your pick.',
    kind: 'points',
    price: 100,
    daysNeeded: 0,
    archived: false,
  },
  {
    id: 'chick-fil-a',
    emoji: '🍗',
    name: 'Chick-fil-A lunch',
    blurb: 'Lunch is on us.',
    kind: 'points',
    price: 400,
    daysNeeded: 0,
    archived: false,
  },
  {
    id: 'arcade-basement',
    emoji: '🕹️',
    name: 'MPB',
    blurb: "A whole afternoon at my parents' basement.",
    kind: 'points',
    price: 800,
    daysNeeded: 0,
    archived: false,
  },
  {
    id: 'cellphone',
    emoji: '📱',
    name: 'A cellphone',
    blurb: 'One hundred days of picking up. Genuinely.',
    kind: 'days',
    price: 0,
    daysNeeded: 100,
    archived: false,
  },
  {
    id: 'switch-2',
    emoji: '🎮',
    name: 'A Nintendo Switch 2',
    blurb: 'Two hundred days of picking up. The big one.',
    kind: 'days',
    price: 0,
    daysNeeded: 200,
    archived: false,
  },
];

/** The rewards on offer, in the order the family arranged them. */
export function activeRewards(save: SaveData): readonly Reward[] {
  return save.rewards.filter((reward) => !reward.archived);
}

export function rewardById(save: SaveData, id: string): Reward | null {
  return save.rewards.find((reward) => reward.id === id) ?? null;
}

export function claimsOf(
  claims: readonly Claim[],
  personId: PersonId,
  rewardId: string,
): readonly Claim[] {
  return claims
    .filter((claim) => claim.personId === personId && claim.rewardId === rewardId)
    .slice()
    .sort((a, b) => a.day.localeCompare(b.day, 'en'));
}

/** Everything this person has ever spent, whatever it was spent on. */
export function pointsSpent(claims: readonly Claim[], personId: PersonId): number {
  return claims
    .filter((claim) => claim.personId === personId)
    .reduce((total, claim) => total + claim.cost, 0);
}

/** Earned minus spent: the number the shop charges against. */
export function pointsBalance(save: SaveData, personId: PersonId): number {
  return careerPoints(save.log, personId) - pointsSpent(save.claims, personId);
}

export function rewardStatus(
  save: SaveData,
  personId: PersonId,
  today: DayKey,
  reward: Reward,
): RewardStatus {
  const mine = claimsOf(save.claims, personId, reward.id);
  const lastClaimed = mine[mine.length - 1]?.day ?? null;
  const timesClaimed = mine.length;

  if (reward.kind === 'points') {
    const balance = pointsBalance(save, personId);
    return {
      reward,
      // Points rewards are never "claimed": save up and buy another.
      state: balance >= reward.price ? 'ready' : 'locked',
      price: reward.price,
      balance,
      shortBy: Math.max(0, reward.price - balance),
      daysDone: 0,
      daysToGo: 0,
      lastClaimed,
      timesClaimed,
    };
  }

  const daysDone = daysPickedUp(save.log, personId, today);

  return {
    reward,
    state: timesClaimed > 0 ? 'claimed' : daysDone >= reward.daysNeeded ? 'ready' : 'locked',
    price: 0,
    balance: 0,
    shortBy: 0,
    daysDone,
    daysToGo: Math.max(0, reward.daysNeeded - daysDone),
    lastClaimed,
    timesClaimed,
  };
}

export function rewardStatuses(
  save: SaveData,
  personId: PersonId,
  today: DayKey,
): readonly RewardStatus[] {
  return activeRewards(save).map((reward) => rewardStatus(save, personId, today, reward));
}

/** How many rewards this person could take right now. Drives the home badge. */
export function readyCount(save: SaveData, personId: PersonId, today: DayKey): number {
  return rewardStatuses(save, personId, today).filter((status) => status.state === 'ready').length;
}

export function canClaim(save: SaveData, personId: PersonId, today: DayKey, rewardId: string): boolean {
  const reward = rewardById(save, rewardId);
  if (!reward || reward.archived) return false;
  if (!save.people.some((person) => person.id === personId)) return false;
  return rewardStatus(save, personId, today, reward).state === 'ready';
}

/** What claiming this would cost right now, so the reducer can record it. */
export function costOf(save: SaveData, rewardId: string): number {
  const reward = rewardById(save, rewardId);
  if (!reward || reward.kind !== 'points') return 0;
  return reward.price;
}

/** The ids a person can take, used to celebrate one coming within reach. */
export function affordableIds(save: SaveData, personId: PersonId, today: DayKey): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const status of rewardStatuses(save, personId, today)) {
    if (status.state === 'ready') ids.add(status.reward.id);
  }
  return ids;
}

/** Rewards that became reachable between two snapshots, in list order. */
export function newlyAffordable(
  save: SaveData,
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): readonly Reward[] {
  return activeRewards(save).filter((reward) => after.has(reward.id) && !before.has(reward.id));
}
