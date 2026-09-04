/**
 * What the work actually buys.
 *
 * Two different currencies, on purpose:
 *
 *   - The three smaller rewards are BOUGHT WITH POINTS. Points scale with how
 *     many you actually picked up, so a big clean-up is worth more than a
 *     token one, which a pure streak gate could never express.
 *   - The two big ones are STREAK MILESTONES, claimed once in a lifetime and
 *     measured against the best run ever reached - so a hundred-day streak
 *     still counts after it eventually breaks. Nobody earns a Switch 2 twice.
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
import type { Claim, PersonId, SaveData, Settings } from './model';
import { careerPoints } from './scoring';
import { bestStreak } from './streaks';

export type RewardKind = 'points' | 'streak';
export type RewardState = 'locked' | 'ready' | 'claimed';

interface RewardBase {
  readonly id: string;
  readonly emoji: string;
  readonly name: string;
  /** One line a child can read. */
  readonly blurb: string;
}

export interface PointsReward extends RewardBase {
  readonly kind: 'points';
  /** Overridable in settings; a claim remembers what it really cost. */
  readonly defaultPrice: number;
}

export interface StreakReward extends RewardBase {
  readonly kind: 'streak';
  readonly streakDays: number;
}

export type RewardDef = PointsReward | StreakReward;

export interface RewardStatus {
  readonly reward: RewardDef;
  readonly state: RewardState;
  /** Points rewards: the current price and how the balance compares. */
  readonly price: number;
  readonly balance: number;
  readonly shortBy: number;
  /** Streak rewards: the best run so far and how far short it is. */
  readonly streak: number;
  readonly daysToGo: number;
  readonly lastClaimed: DayKey | null;
  readonly timesClaimed: number;
}

export const MIN_PRICE = 1;
export const MAX_PRICE = 100_000;

/**
 * Prices are calibrated against what the scoring actually pays: with a live
 * streak a child earns roughly 170 points a week at one pickup a day and 310
 * at three. So screen time lands every few days, lunch is a fortnight's work
 * and the arcade is a monthly treat - and a single day of pickups, worth 10 to
 * 30 points, still buys nothing at all.
 */
export const REWARDS: readonly RewardDef[] = [
  {
    kind: 'points',
    id: 'screen-hour',
    emoji: '📺',
    name: '1 hour of screen time',
    blurb: 'TV, Switch or tablet - your pick.',
    defaultPrice: 100,
  },
  {
    kind: 'points',
    id: 'chick-fil-a',
    emoji: '🍗',
    name: 'Chick-fil-A lunch',
    blurb: 'Lunch is on us.',
    defaultPrice: 400,
  },
  {
    kind: 'points',
    id: 'arcade-basement',
    emoji: '🕹️',
    name: "Grandparents' arcade",
    blurb: 'A whole afternoon in the basement.',
    defaultPrice: 800,
  },
  {
    kind: 'streak',
    id: 'cellphone',
    emoji: '📱',
    name: 'A cellphone',
    blurb: 'One hundred days in a row. Genuinely.',
    streakDays: 100,
  },
  {
    kind: 'streak',
    id: 'switch-2',
    emoji: '🎮',
    name: 'A Nintendo Switch 2',
    blurb: 'Two hundred days. The big one.',
    streakDays: 200,
  },
];

export const POINTS_REWARDS: readonly PointsReward[] = REWARDS.filter(
  (reward): reward is PointsReward => reward.kind === 'points',
);

export function rewardById(id: string): RewardDef | null {
  return REWARDS.find((reward) => reward.id === id) ?? null;
}

export function defaultPrices(): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const reward of POINTS_REWARDS) prices[reward.id] = reward.defaultPrice;
  return prices;
}

export function priceOf(settings: Settings, reward: RewardDef): number {
  if (reward.kind !== 'points') return 0;
  return settings.rewardPrices[reward.id] ?? reward.defaultPrice;
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

/** Everything this person has ever spent. */
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
  reward: RewardDef,
): RewardStatus {
  const mine = claimsOf(save.claims, personId, reward.id);
  const lastClaimed = mine[mine.length - 1]?.day ?? null;
  const timesClaimed = mine.length;

  if (reward.kind === 'points') {
    const price = priceOf(save.settings, reward);
    const balance = pointsBalance(save, personId);
    return {
      reward,
      // Points rewards are never "claimed": save up and buy another.
      state: balance >= price ? 'ready' : 'locked',
      price,
      balance,
      shortBy: Math.max(0, price - balance),
      streak: 0,
      daysToGo: 0,
      lastClaimed,
      timesClaimed,
    };
  }

  const streak = bestStreak(save.log, personId, today);
  const unlocked = streak >= reward.streakDays;

  return {
    reward,
    state: timesClaimed > 0 ? 'claimed' : unlocked ? 'ready' : 'locked',
    price: 0,
    balance: 0,
    shortBy: 0,
    streak,
    daysToGo: Math.max(0, reward.streakDays - streak),
    lastClaimed,
    timesClaimed,
  };
}

export function rewardStatuses(
  save: SaveData,
  personId: PersonId,
  today: DayKey,
): readonly RewardStatus[] {
  return REWARDS.map((reward) => rewardStatus(save, personId, today, reward));
}

/** How many rewards this person could take right now. Drives the home badge. */
export function readyCount(save: SaveData, personId: PersonId, today: DayKey): number {
  return rewardStatuses(save, personId, today).filter((status) => status.state === 'ready').length;
}

export function canClaim(save: SaveData, personId: PersonId, today: DayKey, rewardId: string): boolean {
  const reward = rewardById(rewardId);
  if (!reward) return false;
  if (!save.people.some((person) => person.id === personId)) return false;
  return rewardStatus(save, personId, today, reward).state === 'ready';
}

/** What claiming this would cost right now, so the reducer can record it. */
export function costOf(save: SaveData, rewardId: string): number {
  const reward = rewardById(rewardId);
  if (!reward) return 0;
  return priceOf(save.settings, reward);
}

/** The ids a person can take, used to celebrate one that has just come within reach. */
export function affordableIds(save: SaveData, personId: PersonId, today: DayKey): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const status of rewardStatuses(save, personId, today)) {
    if (status.state === 'ready') ids.add(status.reward.id);
  }
  return ids;
}

/** Rewards that became reachable between two snapshots, in ladder order. */
export function newlyAffordable(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): readonly RewardDef[] {
  return REWARDS.filter((reward) => after.has(reward.id) && !before.has(reward.id));
}
