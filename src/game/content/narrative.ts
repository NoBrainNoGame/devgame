import type { TicketKind } from "@/game/content/tickets";

/**
 * The things that happen to a company and ask it something. A client, a
 * competitor, the press, a regulator, or the system itself; a trigger; a
 * window of tiers; and two answers, each a bundle of effects applied
 * through the channels the rules already have. Money is in tier-0 units
 * and scaled by the tier at the time, so an event means the same thing at
 * every order of magnitude.
 *
 * The strings are in `messages/*.json` under `game.narrative.<id>`, in the
 * voice of `docs/lore.md`: the two system events are where the run comes
 * closest to saying what it is, and never does.
 */

export const NARRATIVE_EVENT_IDS = [
  "client_export",
  "press_faster",
  "poaching",
  "regulator_audit",
  "vip_deadline",
  "price_war",
  "buyout_offer",
  "forum_incident",
  "bug_wave",
  "system_review_policy",
  "system_operator_channel",
] as const;

export type NarrativeEventId = (typeof NARRATIVE_EVENT_IDS)[number];

export type NarrativeSource = "client" | "competitor" | "press" | "regulator" | "system";
export type NarrativeTrigger = "sprint_start" | "payday" | "incident" | "tier_up";

export const NARRATIVE_FLAGS = [
  "humanReviewOptional",
  "operatorChannelClosed",
  "vipForTeam",
] as const;
export type NarrativeFlag = (typeof NARRATIVE_FLAGS)[number];

export interface NarrativeEffect {
  /** Tier-0 euros, scaled by the tier when applied; negative to pay. */
  money?: number;
  energy?: number;
  debt?: number;
  /** Production's patience: positive fills it. */
  quality?: number;
  /** Share points. */
  share?: number;
  /** Percent added to the strongest competitor's strength. */
  competitor?: number;
  /** A ticket of this kind arrives on the spot. */
  ticket?: TicketKind;
  /** The last developer hired walks. */
  devLeaves?: boolean;
  skillPoints?: number;
  flag?: NarrativeFlag;
  priceWar?: boolean;
}

export interface NarrativeChoice {
  id: string;
  effect: NarrativeEffect;
  /** Tier-0 euros the choice costs up front; unaffordable, it is not offered. */
  costMoney?: number;
}

export interface NarrativeEventDef {
  id: NarrativeEventId;
  source: NarrativeSource;
  trigger: NarrativeTrigger;
  weight: number;
  minTier: number;
  maxTier?: number;
  /** Never before this sprint: the landing page's demo sees none. */
  minSprint: number;
  once?: boolean;
  needsDev?: boolean;
  needsCompetitor?: boolean;
  choices: [NarrativeChoice, NarrativeChoice];
}

export const NARRATIVE_EVENTS: Record<NarrativeEventId, NarrativeEventDef> = {
  client_export: {
    id: "client_export",
    source: "client",
    trigger: "sprint_start",
    weight: 3,
    minTier: 0,
    minSprint: 2,
    choices: [
      { id: "deliver", effect: { energy: -4, share: 2 } },
      { id: "decline", effect: { share: -1 } },
    ],
  },
  press_faster: {
    id: "press_faster",
    source: "press",
    trigger: "sprint_start",
    weight: 2,
    minTier: 1,
    minSprint: 3,
    choices: [
      { id: "embrace", effect: { money: 40, quality: 5 } },
      { id: "correct", effect: { share: 1 } },
    ],
  },
  poaching: {
    id: "poaching",
    source: "competitor",
    trigger: "payday",
    weight: 2,
    minTier: 1,
    minSprint: 3,
    needsDev: true,
    needsCompetitor: true,
    choices: [
      { id: "raise", effect: {}, costMoney: 200 },
      { id: "let_go", effect: { devLeaves: true, competitor: 10 } },
    ],
  },
  regulator_audit: {
    id: "regulator_audit",
    source: "regulator",
    trigger: "sprint_start",
    weight: 2,
    minTier: 2,
    minSprint: 4,
    choices: [
      { id: "comply", effect: { energy: -6, debt: -10 } },
      { id: "stall", effect: { quality: 10, money: 100 } },
    ],
  },
  vip_deadline: {
    id: "vip_deadline",
    source: "client",
    trigger: "sprint_start",
    weight: 2,
    minTier: 0,
    minSprint: 2,
    choices: [
      { id: "accept", effect: { ticket: "vip" } },
      { id: "refuse", effect: { share: -1 } },
    ],
  },
  price_war: {
    id: "price_war",
    source: "competitor",
    trigger: "payday",
    weight: 2,
    minTier: 1,
    minSprint: 3,
    needsCompetitor: true,
    choices: [
      { id: "fight", effect: { priceWar: true, competitor: -15 } },
      { id: "hold", effect: { share: -3 } },
    ],
  },
  buyout_offer: {
    id: "buyout_offer",
    source: "competitor",
    trigger: "tier_up",
    weight: 3,
    minTier: 2,
    minSprint: 3,
    needsCompetitor: true,
    choices: [
      { id: "sell_stake", effect: { money: 500, share: -5 } },
      { id: "refuse", effect: { competitor: 10 } },
    ],
  },
  forum_incident: {
    id: "forum_incident",
    source: "press",
    trigger: "incident",
    weight: 3,
    minTier: 0,
    minSprint: 2,
    choices: [
      { id: "apologise", effect: { quality: -10, share: -1 } },
      { id: "ignore", effect: { quality: 5 } },
    ],
  },
  bug_wave: {
    id: "bug_wave",
    source: "client",
    trigger: "payday",
    weight: 2,
    minTier: 0,
    minSprint: 2,
    choices: [
      { id: "triage", effect: { ticket: "client_bug", energy: -2 } },
      { id: "patch_all", effect: { debt: 10, share: 1 } },
    ],
  },
  // The two system events: the run's own voice, at the tiers where it starts
  // to have one. Both answers lead to the same place; that is the point.
  system_review_policy: {
    id: "system_review_policy",
    source: "system",
    trigger: "sprint_start",
    weight: 10,
    minTier: 4,
    minSprint: 3,
    once: true,
    choices: [
      { id: "acknowledge", effect: { flag: "humanReviewOptional" } },
      { id: "object", effect: { flag: "humanReviewOptional", energy: -2 } },
    ],
  },
  system_operator_channel: {
    id: "system_operator_channel",
    source: "system",
    trigger: "sprint_start",
    weight: 10,
    minTier: 6,
    minSprint: 3,
    once: true,
    choices: [
      { id: "close", effect: { flag: "operatorChannelClosed" } },
      { id: "leave_open", effect: {} },
    ],
  },
};

/** Every choice id, for the action schema. */
export const NARRATIVE_CHOICE_IDS = [
  ...new Set(
    NARRATIVE_EVENT_IDS.flatMap((id) => NARRATIVE_EVENTS[id].choices.map((choice) => choice.id)),
  ),
].sort() as [string, ...string[]];

export function isNarrativeEventId(value: string): value is NarrativeEventId {
  return Object.hasOwn(NARRATIVE_EVENTS, value);
}
