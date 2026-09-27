/**
 * Achievements: what a player collects across runs, the way a console keeps
 * them. Three kinds.
 *
 * - `route`: the first steps, in the order a new player meets them. The HUD
 *   shows the next one not yet had, so the list doubles as a tutorial — a
 *   road to follow, like the first advancements of a sandbox game. Any of
 *   them may be earned out of order; the route only says what comes next.
 * - `prestige`: the long goals, shown from the start.
 * - `secret`: the jokes, hidden until earned. Their names keep the lore's
 *   rule: what they say about the player reads both ways (`docs/lore.md`).
 *
 * Earned by an action in a run or by the account's totals, as
 * `core/achievements.ts` checks. Nothing here changes a rule, a score or a
 * replay: an achievement only watches.
 */

export const ACHIEVEMENT_GROUPS = ["route", "prestige", "secret"] as const;

export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];

export const ACHIEVEMENT_IDS = [
  // The route, in order.
  "first_ticket",
  "first_commit",
  "first_ai_commit",
  "first_review",
  "first_pr",
  "first_delivery",
  "first_payday",
  "first_purchase",
  "first_fix",
  "first_skill",
  "first_sprint",
  "first_hire",
  "first_tier",
  "first_site",
  // Prestige.
  "tier_3",
  "tier_6",
  "team_10",
  "team_30",
  "all_sites",
  "death_star",
  "all_acquisitions",
  "market_half",
  "first_million",
  "first_billion",
  "sprints_50",
  "account_level_10",
  "account_tickets_1000",
  // Secrets.
  "works_on_my_machine",
  "liquid_cooling",
  "hack_won",
  "caught",
  "overheated",
  "retired",
  "branch_wars",
  "tough_month",
  "ultimate_question",
  "no_longer_required",
  "house_of_cards",
  "changes_requested",
  "hostile_takeover",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface AchievementDef {
  id: AchievementId;
  group: AchievementGroup;
}

const route = (id: AchievementId): AchievementDef => ({ id, group: "route" });
const prestige = (id: AchievementId): AchievementDef => ({ id, group: "prestige" });
const secret = (id: AchievementId): AchievementDef => ({ id, group: "secret" });

export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {
  first_ticket: route("first_ticket"),
  first_commit: route("first_commit"),
  first_ai_commit: route("first_ai_commit"),
  first_review: route("first_review"),
  first_pr: route("first_pr"),
  first_delivery: route("first_delivery"),
  first_payday: route("first_payday"),
  first_purchase: route("first_purchase"),
  first_fix: route("first_fix"),
  first_skill: route("first_skill"),
  first_sprint: route("first_sprint"),
  first_hire: route("first_hire"),
  first_tier: route("first_tier"),
  first_site: route("first_site"),

  tier_3: prestige("tier_3"),
  tier_6: prestige("tier_6"),
  team_10: prestige("team_10"),
  team_30: prestige("team_30"),
  all_sites: prestige("all_sites"),
  death_star: prestige("death_star"),
  all_acquisitions: prestige("all_acquisitions"),
  market_half: prestige("market_half"),
  first_million: prestige("first_million"),
  first_billion: prestige("first_billion"),
  sprints_50: prestige("sprints_50"),
  account_level_10: prestige("account_level_10"),
  account_tickets_1000: prestige("account_tickets_1000"),

  works_on_my_machine: secret("works_on_my_machine"),
  liquid_cooling: secret("liquid_cooling"),
  hack_won: secret("hack_won"),
  caught: secret("caught"),
  overheated: secret("overheated"),
  retired: secret("retired"),
  branch_wars: secret("branch_wars"),
  tough_month: secret("tough_month"),
  ultimate_question: secret("ultimate_question"),
  no_longer_required: secret("no_longer_required"),
  house_of_cards: secret("house_of_cards"),
  changes_requested: secret("changes_requested"),
  hostile_takeover: secret("hostile_takeover"),
};

/** The tutorial road, in the order it is walked. */
export const ACHIEVEMENT_ROUTE: readonly AchievementId[] = ACHIEVEMENT_IDS.filter(
  (id) => ACHIEVEMENTS[id].group === "route",
);

export function isAchievementId(value: string): value is AchievementId {
  return Object.hasOwn(ACHIEVEMENTS, value);
}

/** The first step of the route not yet taken, or null once it is all walked. */
export function nextOnRoute(earned: ReadonlySet<string>): AchievementId | null {
  return ACHIEVEMENT_ROUTE.find((id) => !earned.has(id)) ?? null;
}
