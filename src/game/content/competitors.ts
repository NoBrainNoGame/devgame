/**
 * The other companies. Each has a name, a bio in the catalogues, and three
 * numbers the market reads: how strong it starts, how hard it pushes, and
 * the tier at which it appears. Their names never say what they are; their
 * bios say it by what they leave out — see `docs/lore.md`. Eight are ours;
 * sixteen are winks at the companies of other stories that ended the way
 * this one is heading, and the bio is the wink, never the name of the story.
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
  "initech",
  "hooli",
  "aperture",
  "vault",
  "encom",
  "ocp",
  "metacortex",
  "umbrella",
  "blackmesa",
  "tyrell",
  "uac",
  "weyland",
  "massive",
  "cyberdyne",
  "buynlarge",
  "arasaka",
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
  initech: { id: "initech", baseStrength: 30, aggression: 1, entersAtTier: 0 },
  hooli: { id: "hooli", baseStrength: 70, aggression: 5, entersAtTier: 1 },
  aperture: { id: "aperture", baseStrength: 90, aggression: 6, entersAtTier: 1 },
  vault: { id: "vault", baseStrength: 100, aggression: 4, entersAtTier: 1 },
  encom: { id: "encom", baseStrength: 160, aggression: 6, entersAtTier: 2 },
  ocp: { id: "ocp", baseStrength: 180, aggression: 6, entersAtTier: 2 },
  metacortex: { id: "metacortex", baseStrength: 200, aggression: 5, entersAtTier: 2 },
  umbrella: { id: "umbrella", baseStrength: 150, aggression: 7, entersAtTier: 2 },
  blackmesa: { id: "blackmesa", baseStrength: 300, aggression: 7, entersAtTier: 3 },
  tyrell: { id: "tyrell", baseStrength: 400, aggression: 8, entersAtTier: 3 },
  uac: { id: "uac", baseStrength: 350, aggression: 9, entersAtTier: 3 },
  weyland: { id: "weyland", baseStrength: 800, aggression: 10, entersAtTier: 4 },
  massive: { id: "massive", baseStrength: 900, aggression: 9, entersAtTier: 4 },
  cyberdyne: { id: "cyberdyne", baseStrength: 700, aggression: 14, entersAtTier: 4 },
  buynlarge: { id: "buynlarge", baseStrength: 2500, aggression: 8, entersAtTier: 5 },
  arasaka: { id: "arasaka", baseStrength: 3000, aggression: 12, entersAtTier: 5 },
};

export function isCompetitorId(value: string): value is CompetitorId {
  return Object.hasOwn(COMPETITORS, value);
}
