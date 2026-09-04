/**
 * The career ladder, climbed with lifetime points.
 *
 * Calibrated so roughly one pickup a day with a live streak is about 100
 * points a week: Dookie Duke lands around two months in, Grand Poopbah around
 * a year. Reachable, but not on the first afternoon.
 */

export interface Rank {
  readonly title: string;
  readonly emoji: string;
  readonly minPoints: number;
}

/** Ascending by minPoints; `rankFor` relies on that order. */
export const RANKS: readonly Rank[] = [
  { title: 'Poop Rookie', emoji: '🐣', minPoints: 0 },
  { title: 'Scoop Scout', emoji: '🥄', minPoints: 100 },
  { title: 'Bag Handler', emoji: '🛍️', minPoints: 300 },
  { title: 'Turd Herder', emoji: '🤠', minPoints: 600 },
  { title: 'Dookie Duke', emoji: '👑', minPoints: 1000 },
  { title: 'Sultan of Scoop', emoji: '🧞', minPoints: 1750 },
  { title: 'Lord of the Lawn', emoji: '🌳', minPoints: 2750 },
  { title: 'Master of Disaster', emoji: '🦸', minPoints: 4000 },
  { title: 'Grand Poopbah', emoji: '🎖️', minPoints: 6000 },
  { title: 'Legendary Log Wrangler', emoji: '🐉', minPoints: 9000 },
];

const FIRST_RANK: Rank = RANKS[0] ?? { title: 'Poop Rookie', emoji: '🐣', minPoints: 0 };

export function rankFor(points: number): Rank {
  let current = FIRST_RANK;
  for (const rank of RANKS) {
    if (points >= rank.minPoints) current = rank;
  }
  return current;
}

/** The next rung and how far away it is, or null at the top of the ladder. */
export function nextRank(points: number): { readonly rank: Rank; readonly pointsToGo: number } | null {
  const upcoming = RANKS.find((rank) => points < rank.minPoints);
  if (!upcoming) return null;
  return { rank: upcoming, pointsToGo: upcoming.minPoints - points };
}
