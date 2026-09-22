/**
 * The developers you can hire. Each rank holds so many tickets at once, costs
 * so much to bring in, and so much every month to keep. A developer is
 * promoted a rank every few tickets delivered, up to senior, so a cheap
 * junior hired early becomes the senior you could not afford.
 */

export const DEV_RANKS = ["junior", "mid", "senior"] as const;

export type DevRank = (typeof DEV_RANKS)[number];

export interface DevRankDef {
  id: DevRank;
  /** Tickets held at once. */
  capacity: number;
  /** Paid once, on hiring. */
  hireCost: number;
  /** Paid at the end of every month. */
  salary: number;
}

export const DEV_RANK: Record<DevRank, DevRankDef> = {
  junior: { id: "junior", capacity: 1, hireCost: 90, salary: 14 },
  mid: { id: "mid", capacity: 2, hireCost: 200, salary: 30 },
  senior: { id: "senior", capacity: 3, hireCost: 400, salary: 60 },
};

export function isDevRank(value: string): value is DevRank {
  return Object.hasOwn(DEV_RANK, value);
}

/** The rank above, or the same one at the top. */
export function nextRank(rank: DevRank): DevRank {
  const index = DEV_RANKS.indexOf(rank);
  return DEV_RANKS[Math.min(DEV_RANKS.length - 1, index + 1)] ?? rank;
}
