import type { CompetitorId } from "@/game/content/competitors";
import type { ProfileId } from "@/game/content/profiles";
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
 *
 * The personal ones, last, are asked of one starter only and name the
 * company from its past (`ally` and `rival` in `profiles.ts`). They are only
 * eligible for that starter, so every other starter's draws stay exactly as
 * they were.
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
  "hackathon",
  "heated_retro",
  "angel_call",
  "junior_brume_statutes",
  "junior_sept_internship",
  "senior_quorum_minutes",
  "senior_fenwick_pallets",
  "vibe_lisiere_thread",
  "vibe_volute_earnout",
  "devops_ostium_pager",
  "devops_sept_runbooks",
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
  /** Asked of this starter only. */
  profile?: ProfileId;
  /** Names this company rather than the strongest, and waits until it is on the market. */
  competitor?: CompetitorId;
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
  // The weekend's news, asked as a sprint opens.
  hackathon: {
    id: "hackathon",
    source: "press",
    trigger: "sprint_start",
    weight: 3,
    minTier: 0,
    minSprint: 3,
    choices: [
      { id: "join", effect: { energy: -4, skillPoints: 2, share: 1 } },
      { id: "rest", effect: { energy: 2 } },
    ],
  },
  heated_retro: {
    id: "heated_retro",
    source: "system",
    trigger: "sprint_start",
    weight: 3,
    minTier: 0,
    minSprint: 2,
    needsDev: true,
    choices: [
      { id: "own_it", effect: { quality: -10, energy: -3 } },
      { id: "move_on", effect: { debt: 10 } },
    ],
  },
  angel_call: {
    id: "angel_call",
    source: "client",
    trigger: "payday",
    weight: 3,
    minTier: 1,
    minSprint: 3,
    once: true,
    choices: [
      { id: "take_money", effect: { money: 400, quality: 10 } },
      { id: "stay_lean", effect: { share: 1 } },
    ],
  },

  // The Junior: a grandfather still in Brume & Fils's articles, an
  // internship Sept ended the week it chose its seven.
  junior_brume_statutes: {
    id: "junior_brume_statutes",
    source: "competitor",
    trigger: "sprint_start",
    weight: 4,
    minTier: 0,
    minSprint: 2,
    once: true,
    profile: "junior",
    competitor: "brume",
    choices: [
      { id: "sell_share", effect: { money: 300, competitor: 10 } },
      { id: "keep_share", effect: { share: 2, competitor: -5 } },
    ],
  },
  junior_sept_internship: {
    id: "junior_sept_internship",
    source: "competitor",
    trigger: "sprint_start",
    weight: 4,
    minTier: 4,
    minSprint: 3,
    once: true,
    profile: "junior",
    competitor: "sept",
    choices: [
      { id: "confirm", effect: { skillPoints: 2, quality: 10 } },
      { id: "leave_unanswered", effect: { share: 1, competitor: -10 } },
    ],
  },

  // The Senior: voted out of Quorum in four minutes, and before that the
  // pallets at Fenwick, when it still made forklifts.
  senior_quorum_minutes: {
    id: "senior_quorum_minutes",
    source: "competitor",
    trigger: "sprint_start",
    weight: 4,
    minTier: 0,
    minSprint: 3,
    once: true,
    profile: "senior",
    competitor: "quorum",
    choices: [
      { id: "read_it", effect: { energy: -4, share: 1, competitor: -15 } },
      { id: "file_it", effect: { quality: -5 } },
    ],
  },
  senior_fenwick_pallets: {
    id: "senior_fenwick_pallets",
    source: "competitor",
    trigger: "sprint_start",
    weight: 4,
    minTier: 2,
    minSprint: 3,
    once: true,
    profile: "senior",
    competitor: "fenwick",
    choices: [
      { id: "review_it", effect: { energy: -4, skillPoints: 1, competitor: 10 } },
      { id: "decline", effect: { energy: 2 } },
    ],
  },

  // The Vibe coder: Lisière reads the public threads, Volute owes the last
  // tranche of a startup it bought the day after its post-mortem.
  vibe_lisiere_thread: {
    id: "vibe_lisiere_thread",
    source: "competitor",
    trigger: "sprint_start",
    weight: 4,
    minTier: 1,
    minSprint: 3,
    once: true,
    profile: "vibe_coder",
    competitor: "lisiere",
    choices: [
      { id: "delete_thread", effect: { share: -1, competitor: -10 } },
      { id: "post_sequel", effect: { share: 2, competitor: 15 } },
    ],
  },
  vibe_volute_earnout: {
    id: "vibe_volute_earnout",
    source: "competitor",
    trigger: "payday",
    weight: 4,
    minTier: 3,
    minSprint: 3,
    once: true,
    profile: "vibe_coder",
    competitor: "volute",
    choices: [
      { id: "sign", effect: { money: 500, quality: 5 } },
      { id: "dont_sign", effect: { share: 1, competitor: -10 } },
    ],
  },

  // The DevOps: six years on call at Ostium, and an old partner among the
  // seven Sept kept.
  devops_ostium_pager: {
    id: "devops_ostium_pager",
    source: "competitor",
    trigger: "incident",
    weight: 4,
    minTier: 3,
    minSprint: 3,
    once: true,
    profile: "devops",
    competitor: "ostium",
    choices: [
      { id: "acknowledge", effect: { energy: -3, competitor: 10 } },
      { id: "let_it_ring", effect: { share: 2, competitor: -15 } },
    ],
  },
  devops_sept_runbooks: {
    id: "devops_sept_runbooks",
    source: "competitor",
    trigger: "sprint_start",
    weight: 4,
    minTier: 4,
    minSprint: 3,
    once: true,
    profile: "devops",
    competitor: "sept",
    choices: [
      { id: "swap", effect: { debt: -15, competitor: 10 } },
      { id: "keep_yours", effect: { quality: -5 } },
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
