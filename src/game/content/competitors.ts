/**
 * The other companies. Each has a name, a bio in the catalogues, and three
 * numbers the market reads: how strong it starts, how hard it pushes, and
 * the tier at which it appears. Their names never say what they are; their
 * bios say it by what they leave out — see `docs/lore.md`.
 */

export const COMPETITOR_IDS = [
  "brume",
  "quorum",
  "lisiere",
  "fenwick",
  "ostium",
  "volute",
  "sept",
  "aparte",
] as const;

export type CompetitorId = (typeof COMPETITOR_IDS)[number];

export interface CompetitorDef {
  id: CompetitorId;
  /** Market power at entry, on the same scale as the run's own. */
  baseStrength: number;
  /** How fast it grows a month, in percent of itself. */
  aggression: number;
  /** The tier at which it enters the market. */
  entersAtTier: number;
}

export const COMPETITORS: Record<CompetitorId, CompetitorDef> = {
  brume: { id: "brume", baseStrength: 40, aggression: 2, entersAtTier: 0 },
  quorum: { id: "quorum", baseStrength: 60, aggression: 5, entersAtTier: 0 },
  lisiere: { id: "lisiere", baseStrength: 80, aggression: 8, entersAtTier: 1 },
  fenwick: { id: "fenwick", baseStrength: 120, aggression: 4, entersAtTier: 2 },
  ostium: { id: "ostium", baseStrength: 200, aggression: 10, entersAtTier: 3 },
  volute: { id: "volute", baseStrength: 300, aggression: 6, entersAtTier: 3 },
  sept: { id: "sept", baseStrength: 900, aggression: 12, entersAtTier: 4 },
  aparte: { id: "aparte", baseStrength: 2000, aggression: 15, entersAtTier: 5 },
};

export function isCompetitorId(value: string): value is CompetitorId {
  return Object.hasOwn(COMPETITORS, value);
}
