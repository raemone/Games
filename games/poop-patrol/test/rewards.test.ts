import { describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates';
import { defaultSettings } from '../src/core/model';
import type { Claim, SaveData } from '../src/core/model';
import { reduce } from '../src/core/reducer';
import { careerPoints } from '../src/core/scoring';
import {
  MAX_PRICE,
  REWARDS,
  affordableIds,
  canClaim,
  newlyAffordable,
  pointsBalance,
  pointsSpent,
  priceOf,
  readyCount,
  rewardById,
  rewardStatus,
  rewardStatuses,
} from '../src/core/rewards';
import { logFor, person, saveWith } from './helpers';

const TODAY = '2026-09-04';

/**
 * One pickup a day for `days` days, ending at `end`. With the streak bonus
 * that pays 10, 25, 45, 70, 100, 135, 170... cumulative - so five days is
 * exactly the 100 points a screen hour costs.
 */
function run(days: number, end = TODAY): ReturnType<typeof logFor> {
  const entries: Record<string, number> = {};
  for (let back = 0; back < days; back += 1) entries[addDays(end, -back)] = 1;
  return logFor('p1', entries);
}

function saveWithStreak(days: number, claims: readonly Claim[] = []): SaveData {
  return saveWith([person('p1', 'Mila')], run(days), 25, claims);
}

function withPrices(save: SaveData, prices: Record<string, number>): SaveData {
  return { ...save, settings: { ...save.settings, rewardPrices: prices } };
}

function statusOf(save: SaveData, rewardId: string, today = TODAY) {
  const reward = rewardById(rewardId);
  if (!reward) throw new Error(`no such reward: ${rewardId}`);
  return rewardStatus(save, 'p1', today, reward);
}

describe('the reward ladder', () => {
  it('has unique ids', () => {
    expect(new Set(REWARDS.map((reward) => reward.id)).size).toBe(REWARDS.length);
  });

  it('matches what the family agreed', () => {
    expect(
      REWARDS.map((reward) =>
        reward.kind === 'points'
          ? [reward.id, 'points', reward.defaultPrice]
          : [reward.id, 'streak', reward.streakDays],
      ),
    ).toEqual([
      ['screen-hour', 'points', 100],
      ['chick-fil-a', 'points', 400],
      ['arcade-basement', 'points', 800],
      ['cellphone', 'streak', 100],
      ['switch-2', 'streak', 200],
    ]);
  });

  it('gives every reward a name, an emoji and a blurb', () => {
    for (const reward of REWARDS) {
      expect(reward.name.length).toBeGreaterThan(0);
      expect(reward.emoji.length).toBeGreaterThan(0);
      expect(reward.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('the points balance', () => {
  it('is what you earned when nothing has been spent', () => {
    const save = saveWithStreak(5);
    expect(careerPoints(save.log, 'p1')).toBe(100);
    expect(pointsBalance(save, 'p1')).toBe(100);
  });

  it('is earned minus spent', () => {
    const claims: Claim[] = [{ rewardId: 'screen-hour', personId: 'p1', day: TODAY, cost: 100 }];
    const save = saveWithStreak(7, claims);
    expect(careerPoints(save.log, 'p1')).toBe(170);
    expect(pointsSpent(save.claims, 'p1')).toBe(100);
    expect(pointsBalance(save, 'p1')).toBe(70);
  });

  it('never lets spending touch the earned score the leaderboard uses', () => {
    // Redeeming must not cost somebody their place, or nobody would redeem.
    const before = saveWithStreak(7);
    const after = reduce(before, { kind: 'claimReward', rewardId: 'screen-hour', personId: 'p1' }, TODAY);
    expect(careerPoints(after.log, 'p1')).toBe(careerPoints(before.log, 'p1'));
    expect(pointsBalance(after, 'p1')).toBeLessThan(pointsBalance(before, 'p1'));
  });

  it('counts only this person', () => {
    const claims: Claim[] = [{ rewardId: 'screen-hour', personId: 'p2', day: TODAY, cost: 100 }];
    expect(pointsSpent(claims, 'p1')).toBe(0);
  });
});

describe('buying with points', () => {
  it('buys nothing at all for one day of poop', () => {
    // The rule the family asked for. A single day is worth 10 points; the
    // cheapest thing on the list is 100.
    const save = saveWithStreak(1);
    expect(pointsBalance(save, 'p1')).toBe(10);
    expect(readyCount(save, 'p1', TODAY)).toBe(0);
  });

  it('is locked while the balance is short, and says by how much', () => {
    const save = saveWithStreak(4); // 70 points
    expect(statusOf(save, 'screen-hour')).toMatchObject({
      state: 'locked',
      price: 100,
      balance: 70,
      shortBy: 30,
    });
  });

  it('is ready the moment the balance exactly covers the price', () => {
    expect(statusOf(saveWithStreak(5), 'screen-hour')).toMatchObject({
      state: 'ready',
      balance: 100,
      shortBy: 0,
    });
  });

  it('can be bought again once the balance rebuilds', () => {
    const claims: Claim[] = [{ rewardId: 'screen-hour', personId: 'p1', day: '2026-08-20', cost: 100 }];
    const save = saveWithStreak(9, claims); // 240 earned, 100 spent, 140 left
    expect(statusOf(save, 'screen-hour')).toMatchObject({ state: 'ready', timesClaimed: 1 });
  });

  it('unlocks the dearer rewards only once they are afforded', () => {
    const save = saveWithStreak(7); // 170 points
    expect(statusOf(save, 'screen-hour').state).toBe('ready');
    expect(statusOf(save, 'chick-fil-a')).toMatchObject({ state: 'locked', shortBy: 230 });
    expect(statusOf(save, 'arcade-basement')).toMatchObject({ state: 'locked', shortBy: 630 });
  });
});

describe('prices', () => {
  it('falls back to the built-in default when settings say nothing', () => {
    const bare = { ...defaultSettings(), rewardPrices: {} };
    const reward = rewardById('chick-fil-a');
    expect(reward && priceOf(bare, reward)).toBe(400);
  });

  it('honours an override from settings', () => {
    const save = withPrices(saveWithStreak(3), { 'screen-hour': 40 });
    expect(statusOf(save, 'screen-hour')).toMatchObject({ price: 40, state: 'ready', balance: 45 });
  });

  it('is zero for a streak reward, which is not for sale', () => {
    const reward = rewardById('switch-2');
    expect(reward && priceOf(defaultSettings(), reward)).toBe(0);
  });

  it('clamps what a parent types', () => {
    const save = saveWithStreak(5);
    const cheap = reduce(
      save,
      { kind: 'setSettings', settings: { ...save.settings, rewardPrices: { 'screen-hour': -50 } } },
      TODAY,
    );
    expect(cheap.settings.rewardPrices['screen-hour']).toBe(1);

    const silly = reduce(
      save,
      { kind: 'setSettings', settings: { ...save.settings, rewardPrices: { 'screen-hour': 1e9 } } },
      TODAY,
    );
    expect(silly.settings.rewardPrices['screen-hour']).toBe(MAX_PRICE);
  });

  it('drops a price that is not a number', () => {
    const save = saveWithStreak(5);
    const next = reduce(
      save,
      {
        kind: 'setSettings',
        settings: { ...save.settings, rewardPrices: { 'screen-hour': Number.NaN } },
      },
      TODAY,
    );
    expect(next.settings.rewardPrices['screen-hour']).toBeUndefined();
  });

  it('does not rewrite what a past claim cost', () => {
    // Bought at 100, then the parent puts the price up. The old claim stands.
    const bought = reduce(
      saveWithStreak(5),
      { kind: 'claimReward', rewardId: 'screen-hour', personId: 'p1' },
      TODAY,
    );
    expect(bought.claims[0]?.cost).toBe(100);

    const repriced = withPrices(bought, { 'screen-hour': 900 });
    expect(pointsSpent(repriced.claims, 'p1')).toBe(100);
    expect(pointsBalance(repriced, 'p1')).toBe(0);
  });
});

describe('streak milestones', () => {
  it('needs the full run, not a day less', () => {
    expect(statusOf(saveWithStreak(99), 'cellphone')).toMatchObject({ state: 'locked', daysToGo: 1 });
    expect(statusOf(saveWithStreak(100), 'cellphone').state).toBe('ready');
    expect(statusOf(saveWithStreak(199), 'switch-2')).toMatchObject({ state: 'locked', daysToGo: 1 });
    expect(statusOf(saveWithStreak(200), 'switch-2').state).toBe('ready');
  });

  it('is measured against the best run ever, not the current one', () => {
    // A hundred-day run that ended a month ago still earned the cellphone.
    const save = saveWith([person('p1')], run(100, addDays(TODAY, -30)));
    expect(statusOf(save, 'cellphone').state).toBe('ready');
  });

  it('cannot be bought with points, however rich you are', () => {
    const save = saveWithStreak(50); // plenty of points, nowhere near 100 days
    expect(pointsBalance(save, 'p1')).toBeGreaterThan(1000);
    expect(statusOf(save, 'cellphone').state).toBe('locked');
  });

  it('costs no points when taken', () => {
    const claimed = reduce(
      saveWithStreak(100),
      { kind: 'claimReward', rewardId: 'cellphone', personId: 'p1' },
      TODAY,
    );
    expect(claimed.claims[0]?.cost).toBe(0);
    expect(pointsBalance(claimed, 'p1')).toBe(careerPoints(claimed.log, 'p1'));
  });

  it('can never be claimed twice', () => {
    const claims: Claim[] = [{ rewardId: 'switch-2', personId: 'p1', day: '2026-01-01', cost: 0 }];
    expect(statusOf(saveWithStreak(200, claims), 'switch-2').state).toBe('claimed');
    expect(canClaim(saveWithStreak(200, claims), 'p1', TODAY, 'switch-2')).toBe(false);
  });
});

describe('claiming through the reducer', () => {
  it('records the claim on today, with its cost', () => {
    const next = reduce(
      saveWithStreak(5),
      { kind: 'claimReward', rewardId: 'screen-hour', personId: 'p1' },
      TODAY,
    );
    expect(next.claims).toEqual([
      { rewardId: 'screen-hour', personId: 'p1', day: TODAY, cost: 100 },
    ]);
  });

  it('refuses what cannot be afforded', () => {
    const save = saveWithStreak(4); // 70 points, 30 short
    expect(reduce(save, { kind: 'claimReward', rewardId: 'screen-hour', personId: 'p1' }, TODAY)).toBe(
      save,
    );
  });

  it('refuses a second buy the balance cannot cover', () => {
    const save = saveWithStreak(5); // exactly 100
    const once = reduce(save, { kind: 'claimReward', rewardId: 'screen-hour', personId: 'p1' }, TODAY);
    expect(once.claims).toHaveLength(1);
    const twice = reduce(once, { kind: 'claimReward', rewardId: 'screen-hour', personId: 'p1' }, TODAY);
    expect(twice).toBe(once);
  });

  it('refuses an unknown reward or an unknown person', () => {
    const save = saveWithStreak(200);
    expect(reduce(save, { kind: 'claimReward', rewardId: 'a-pony', personId: 'p1' }, TODAY)).toBe(save);
    expect(
      reduce(save, { kind: 'claimReward', rewardId: 'screen-hour', personId: 'nobody' }, TODAY),
    ).toBe(save);
  });

  it('refunds on unclaim, for a mis-tap', () => {
    const save = saveWithStreak(5);
    const bought = reduce(save, { kind: 'claimReward', rewardId: 'screen-hour', personId: 'p1' }, TODAY);
    expect(pointsBalance(bought, 'p1')).toBe(0);

    const undone = reduce(
      bought,
      { kind: 'unclaimReward', rewardId: 'screen-hour', personId: 'p1' },
      TODAY,
    );
    expect(undone.claims).toEqual([]);
    expect(pointsBalance(undone, 'p1')).toBe(100);
  });

  it('takes back only the most recent claim', () => {
    const claims: Claim[] = [
      { rewardId: 'screen-hour', personId: 'p1', day: '2026-08-19', cost: 100 },
      { rewardId: 'screen-hour', personId: 'p1', day: TODAY, cost: 100 },
    ];
    const undone = reduce(
      saveWithStreak(20, claims),
      { kind: 'unclaimReward', rewardId: 'screen-hour', personId: 'p1' },
      TODAY,
    );
    expect(undone.claims).toEqual([
      { rewardId: 'screen-hour', personId: 'p1', day: '2026-08-19', cost: 100 },
    ]);
  });

  it('is a no-op when there is nothing to unclaim', () => {
    const save = saveWithStreak(5);
    expect(reduce(save, { kind: 'unclaimReward', rewardId: 'screen-hour', personId: 'p1' }, TODAY)).toBe(
      save,
    );
  });

  it("takes a deleted person's claims with them", () => {
    const claims: Claim[] = [{ rewardId: 'screen-hour', personId: 'p1', day: TODAY, cost: 100 }];
    const save = saveWith([person('p1'), person('p2')], run(5), 25, claims);
    expect(reduce(save, { kind: 'deletePerson', personId: 'p1' }, TODAY).claims).toEqual([]);
  });
});

describe('newlyAffordable', () => {
  it('reports what just came within reach, in ladder order', () => {
    const before = affordableIds(saveWithStreak(1), 'p1', TODAY);
    const after = affordableIds(saveWithStreak(5), 'p1', TODAY);
    expect(newlyAffordable(before, after).map((reward) => reward.id)).toEqual(['screen-hour']);
  });

  it('reports nothing when nothing changed', () => {
    const ids = affordableIds(saveWithStreak(5), 'p1', TODAY);
    expect(newlyAffordable(ids, ids)).toEqual([]);
  });

  it('never reports something that was spent away', () => {
    const before = affordableIds(saveWithStreak(5), 'p1', TODAY);
    const spent = reduce(
      saveWithStreak(5),
      { kind: 'claimReward', rewardId: 'screen-hour', personId: 'p1' },
      TODAY,
    );
    const after = affordableIds(spent, 'p1', TODAY);
    expect(newlyAffordable(before, after)).toEqual([]);
  });
});

describe('rewardStatuses', () => {
  it('returns one entry per reward, in ladder order', () => {
    const statuses = rewardStatuses(saveWithStreak(5), 'p1', TODAY);
    expect(statuses.map((status) => status.reward.id)).toEqual(REWARDS.map((reward) => reward.id));
  });

  it('scores each person separately', () => {
    const save = saveWith([person('p1'), person('p2')], run(5));
    expect(readyCount(save, 'p1', TODAY)).toBe(1);
    expect(readyCount(save, 'p2', TODAY)).toBe(0);
  });
});
