import type { DevRank } from "@/game/content/team";

/**
 * Companies a run can buy. One of each, one per tier from the second: the
 * money buys a team already hired and features already shipped — with their
 * revenue, their users, and the debt nobody looked at before signing. The
 * big ones come with an incident: something in what was bought was already
 * on fire.
 *
 * Nothing here counts towards the score or the experience: bought is not
 * delivered.
 */

export const ACQUISITION_IDS = ["startup", "scaleup", "competitor", "conglomerate"] as const;

export type AcquisitionId = (typeof ACQUISITION_IDS)[number];

export interface AcquisitionDef {
  id: AcquisitionId;
  /** Lowest tier at which it is for sale. */
  tier: number;
  cost: number;
  devs: { rank: DevRank; count: number };
  /** Features already shipped, each of this many points, at the run's tier. */
  features: { count: number; points: number };
  /** Debt the purchase brings. */
  debt: number;
  /** Something in what was bought breaks on arrival. */
  incident: boolean;
}

export const ACQUISITIONS: Record<AcquisitionId, AcquisitionDef> = {
  startup: {
    id: "startup",
    tier: 2,
    cost: 30_000,
    devs: { rank: "junior", count: 2 },
    features: { count: 3, points: 4 },
    debt: 10,
    incident: false,
  },
  scaleup: {
    id: "scaleup",
    tier: 3,
    cost: 300_000,
    devs: { rank: "mid", count: 3 },
    features: { count: 6, points: 5 },
    debt: 15,
    incident: false,
  },
  competitor: {
    id: "competitor",
    tier: 4,
    cost: 3_000_000,
    devs: { rank: "senior", count: 4 },
    features: { count: 12, points: 6 },
    debt: 20,
    incident: true,
  },
  conglomerate: {
    id: "conglomerate",
    tier: 5,
    cost: 30_000_000,
    devs: { rank: "senior", count: 8 },
    features: { count: 24, points: 7 },
    debt: 25,
    incident: true,
  },
};

export function isAcquisitionId(value: string): value is AcquisitionId {
  return Object.hasOwn(ACQUISITIONS, value);
}
