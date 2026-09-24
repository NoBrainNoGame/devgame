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
  junior: { id: "junior", capacity: 1, speed: 1, hireCost: 200, salary: 30, tier: 0 },
  mid: { id: "mid", capacity: 2, speed: 2, hireCost: 2_000, salary: 150, tier: 1 },
  senior: { id: "senior", capacity: 3, speed: 3, hireCost: 20_000, salary: 800, tier: 2 },
};

/**
 * First names, drawn at hiring so the roster, the log and the graph can say
 * who holds what. Short, from everywhere, none of them the game's own words.
 */
export const DEV_NAMES = [
  "Nora",
  "Idris",
  "Maya",
  "Théo",
  "Léa",
  "Sami",
  "Inès",
  "Kofi",
  "Yuki",
  "Aylin",
  "Mateo",
  "Zoé",
  "Ravi",
  "Lina",
  "Omar",
  "Elsa",
  "Nils",
  "Aria",
  "Jules",
  "Mila",
  "Tariq",
  "Hana",
  "Enzo",
  "Noor",
  "Louis",
  "Sana",
  "Ayo",
  "Livia",
  "Kenji",
  "Farah",
  "Milo",
  "Ada",
  "Pavel",
  "Suki",
  "Amir",
  "Léo",
  "Wren",
  "Diego",
  "Imani",
  "Bastien",
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
