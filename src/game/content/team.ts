/**
 * The developers you can hire. A rank is how many tickets one holds at a
 * time and how many points a turn they fill; the prices are an order of
 * magnitude apart because the throughput is, and each rank appears at the
 * tier where a feature earns enough to pay it back within a sprint.
 */

export const DEV_RANKS = ["junior", "mid", "senior"] as const;

export type DevRank = (typeof DEV_RANKS)[number];

export interface DevRankDef {
  id: DevRank;
  /** Tickets held at once. */
  capacity: number;
  /** Story points filled per turn, across the tickets held. */
  speed: number;
  hireCost: number;
  salary: number;
  /** Lowest tier at which the rank can be hired. */
  tier: number;
}

export const DEV_RANK: Record<DevRank, DevRankDef> = {
  // Below the ladder on purpose: the junior is all a tier-0 run can hire, and
  // at a mid's tenth the first hire came so late that a player carrying tier 1
  // alone burnt out in one careful run out of six (sim, 2026-09-27).
  junior: { id: "junior", capacity: 1, speed: 1, hireCost: 400, salary: 60, tier: 0 },
  mid: { id: "mid", capacity: 2, speed: 2, hireCost: 6_000, salary: 450, tier: 1 },
  senior: { id: "senior", capacity: 3, speed: 3, hireCost: 60_000, salary: 2_400, tier: 2 },
};

/**
 * Names, drawn at hiring so the roster, the log and the graph can say who
 * holds what. Borrowed from the programmers and hackers history kept — a
 * surname, or the handle they were known by — so a hire reads as a nod, and
 * none of them is the game's own word. More names than a full team, or the
 * roster repeats one.
 */
export const DEV_NAMES = [
  "Lovelace",
  "Hopper",
  "Turing",
  "Hamilton",
  "Torvalds",
  "Ritchie",
  "Thompson",
  "Knuth",
  "Dijkstra",
  "Liskov",
  "Kernighan",
  "Stroustrup",
  "Carmack",
  "Wozniak",
  "Stallman",
  "Berners-Lee",
  "Lamport",
  "Hoare",
  "McCarthy",
  "Backus",
  "Kay",
  "Engelbart",
  "Cerf",
  "Allen",
  "Goldberg",
  "Wilson",
  "Bartik",
  "Matsumoto",
  "van Rossum",
  "Gosling",
  "Hejlsberg",
  "Lerdorf",
  "Wall",
  "Pike",
  "Romero",
  "Iwata",
  "Nakamoto",
  "Swartz",
  "Mitnick",
  "Crunch",
  "Poulsen",
  "Mudge",
  "Morris",
  "Kamkar",
  "geohot",
  "Lamarr",
  "Shannon",
  "Babbage",
  "Zuse",
  "Clarke",
] as const;

/**
 * How many colours the team is told apart with. Spread over the whole
 * spectrum by `DEV_COLOURS` in the theme and `--color-dev-<n>` in the CSS;
 * the player is the first, every hire takes the next.
 */
export const DEV_COLOUR_COUNT = 8;

/** The player's colour index. */
export const PLAYER_COLOUR = 0;

/** Which of the colours a developer wears: their serial, wrapping past the player's. */
export function devColourIndex(id: string): number {
  const serial = Number(id.slice(1));
  return Number.isInteger(serial) && serial > 0 ? serial % DEV_COLOUR_COUNT : PLAYER_COLOUR;
}

export function isDevRank(value: string): value is DevRank {
  return Object.hasOwn(DEV_RANK, value);
}

export function nextRank(rank: DevRank): DevRank {
  const index = DEV_RANKS.indexOf(rank);
  return DEV_RANKS[Math.min(DEV_RANKS.length - 1, index + 1)] ?? rank;
}
