import type { PartialEffects } from "@/game/content/effects";
import type { DevRank } from "@/game/content/team";
import type { TicketKind } from "@/game/content/tickets";

/**
 * Sprint bonuses — "relics" everywhere in the code, for history. Three are
 * offered when a sprint closes, one is taken. Most are **boosts**: applied
 * on the spot and gone, offered again another sprint if they would still
 * do something. A few are **keeps**: permanent, unique, and never for sale
 * in the shop or the tree — the whole point of picking one over the other.
 *
 * A boost is only offered when its `when` holds, so the choice is never
 * between three things and one that does nothing.
 */

export const RELIC_IDS = [
  // boosts
  "second_wind",
  "clean_slate",
  "postmortem",
  "intern",
  "promotion",
  "group_deal",
  "headhunter",
  "grant",
  "bootcamp",
  "viral_thread",
  "overtime",
  "review_party",
  "grooming",
  "big_client",
  "golden_quarter",
  // keeps
  "tech_radar",
  "retrospective",
  "pair_programming",
  "blameless",
  "sla_renegotiated",
] as const;

export type RelicId = (typeof RELIC_IDS)[number];
export type RelicKind = "boost" | "keep";

/** When a boost is worth offering. Evaluated by `rules/relics.ts`. */
export type RelicCondition =
  | "energy_missing"
  | "debt_present"
  | "quality_present"
  | "seat_free"
  | "dev_promotable"
  | "no_discount"
  | "no_free_hire"
  | "unread_ai"
  | "backlog_untouched"
  | "no_revenue_boost";

export interface BoostEffect {
  /** Fills the bar. */
  fullEnergy?: boolean;
  /** Debt taken away; "all" clears it. */
  debt?: number | "all";
  /** Production's patience given back (positive empties the gauge). */
  quality?: number;
  /** A developer of this rank joins for free. */
  dev?: DevRank;
  /** The most recent developer goes up a rank. */
  promote?: boolean;
  /** Percent off the next upgrade bought. */
  shopDiscountPct?: number;
  /** The next hire costs nothing. */
  freeHire?: boolean;
  /** Tier-0 euros, scaled by the tier when applied. */
  money?: number;
  skillPoints?: number;
  /** Share points. */
  share?: number;
  /** Turns added to the sprint that is about to start. */
  extraTurns?: number;
  /** Every unread machine-written commit counts as read. */
  reviewAll?: boolean;
  /** Every backlog ticket nobody touched is cancelled. */
  clearBacklog?: boolean;
  /** A ticket of this kind arrives on the spot. */
  ticket?: TicketKind;
  /** Paydays with the revenue multiplied by `economy.boostedRevenuePct`. */
  revenueBoostMonths?: number;
}

export interface RelicDef {
  id: RelicId;
  kind: RelicKind;
  /** Boost: applied once, the moment it is taken. */
  boost?: BoostEffect;
  /** Boost: offered only when this holds. */
  when?: RelicCondition;
  /** Keep: permanent, recomputed every turn. */
  effects: PartialEffects;
}

const boost = (id: RelicId, effect: BoostEffect, when?: RelicCondition): RelicDef => ({
  id,
  kind: "boost",
  boost: effect,
  ...(when === undefined ? {} : { when }),
  effects: {},
});

const keep = (id: RelicId, effects: PartialEffects): RelicDef => ({ id, kind: "keep", effects });

export const RELICS: Record<RelicId, RelicDef> = {
  second_wind: boost("second_wind", { fullEnergy: true }, "energy_missing"),
  clean_slate: boost("clean_slate", { debt: "all" }, "debt_present"),
  postmortem: boost("postmortem", { quality: 30 }, "quality_present"),
  intern: boost("intern", { dev: "junior" }, "seat_free"),
  promotion: boost("promotion", { promote: true }, "dev_promotable"),
  group_deal: boost("group_deal", { shopDiscountPct: 25 }, "no_discount"),
  headhunter: boost("headhunter", { freeHire: true }, "no_free_hire"),
  grant: boost("grant", { money: 150 }),
  bootcamp: boost("bootcamp", { skillPoints: 3 }),
  viral_thread: boost("viral_thread", { share: 3 }),
  overtime: boost("overtime", { extraTurns: 4 }),
  review_party: boost("review_party", { reviewAll: true }, "unread_ai"),
  grooming: boost("grooming", { clearBacklog: true }, "backlog_untouched"),
  big_client: boost("big_client", { ticket: "vip", money: 100 }),
  golden_quarter: boost("golden_quarter", { revenueBoostMonths: 3 }, "no_revenue_boost"),

  tech_radar: keep("tech_radar", { allSuccessPoints: 5 }),
  retrospective: keep("retrospective", { reviewExtraCommits: 1 }),
  pair_programming: keep("pair_programming", { reviewEnergyDiscount: 1 }),
  blameless: keep("blameless", { counterPrRejection: true }),
  sla_renegotiated: keep("sla_renegotiated", { qualityMaxBonus: 20 }),
};

export const RELIC_BOOST_IDS: RelicId[] = RELIC_IDS.filter((id) => RELICS[id].kind === "boost");
export const RELIC_KEEP_IDS: RelicId[] = RELIC_IDS.filter((id) => RELICS[id].kind === "keep");
