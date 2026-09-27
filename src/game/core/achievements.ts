import {
  ACHIEVEMENT_IDS,
  ACQUISITION_IDS,
  type AchievementId,
  UPGRADES,
  upgradesIn,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { loadOf, mrrOf } from "@/game/core/rules/economy";
import { shareOf } from "@/game/core/rules/market";
import { gatherEffects } from "@/game/core/rules/modifiers";
import type { GameEvent, PlayerAction, RunState } from "@/game/core/types";

/**
 * What an action earned, in achievements. Pure and read-only: it watches the
 * state an action left and the events it raised, and changes neither — so
 * achievements never touch a rule, a score or a replay, and the fingerprint
 * does not hash them.
 *
 * A check answers "is it earned now?", not "was it earned by this action":
 * a condition on the state (a tier, a team size) stays true action after
 * action, and whoever keeps the collection ignores what it already holds.
 */

export interface AchievementContext {
  state: RunState;
  events: readonly GameEvent[];
  action: PlayerAction;
}

/** The account's totals, as the profile keeps them. */
export interface AccountProgress {
  level: number;
  ticketsDelivered: number;
}

type RunCheck = { source: "run"; earned: (context: AchievementContext) => boolean };
type AccountCheck = { source: "account"; earned: (account: AccountProgress) => boolean };

const run = (earned: RunCheck["earned"]): RunCheck => ({ source: "run", earned });
const account = (earned: AccountCheck["earned"]): AccountCheck => ({ source: "account", earned });

function has<T extends GameEvent["type"]>(
  events: readonly GameEvent[],
  type: T,
  test: (event: Extract<GameEvent, { type: T }>) => boolean = () => true,
): boolean {
  return events.some(
    (event): boolean => event.type === type && test(event as Extract<GameEvent, { type: T }>),
  );
}

const SITES = upgradesIn("org");

function endedBy(context: AchievementContext, reason: string): boolean {
  return has(context.events, "game_over", (event) => event.reason === reason);
}

const CHECKS: Record<AchievementId, RunCheck | AccountCheck> = {
  first_ticket: run(({ action }) => action.type === "start"),
  first_commit: run(({ action }) => action.type === "commit"),
  first_ai_commit: run(({ action }) => action.type === "commit" && action.mode === "ai"),
  first_review: run(({ action }) => action.type === "review"),
  first_pr: run(({ action }) => action.type === "submit"),
  first_delivery: run(({ events }) => has(events, "ticket_merged", (e) => e.devId === undefined)),
  first_payday: run(({ events }) => has(events, "month_closed", (e) => e.revenue > 0)),
  first_purchase: run(({ events }) => has(events, "upgrade_bought")),
  // A bug the review marked, fixed; or a hotfix or a customer's bug, landed by hand.
  first_fix: run(
    ({ state, events }) =>
      has(events, "bug_fixed") ||
      has(events, "ticket_merged", (e) => {
        const kind = state.tickets[e.ticketId]?.kind;
        return e.devId === undefined && (kind === "hotfix" || kind === "client_bug");
      }),
  ),
  first_skill: run(({ events }) => has(events, "tree_placed")),
  first_sprint: run(({ events }) => has(events, "sprint_ended")),
  first_hire: run(({ events }) => has(events, "hired")),
  first_tier: run(({ state }) => state.tier >= 1),
  first_site: run(({ state }) => SITES.some((id) => (state.upgrades[id] ?? 0) > 0)),

  tier_3: run(({ state }) => state.tier >= 3),
  tier_6: run(({ state }) => state.tier >= BALANCE.economy.tier.last),
  team_10: run(({ state }) => state.devs.length >= 10),
  team_30: run(({ state }) => state.devs.length >= 30),
  all_sites: run(({ state }) => SITES.every((id) => (state.upgrades[id] ?? 0) > 0)),
  death_star: run(({ state }) => (state.upgrades.death_star ?? 0) > 0),
  all_acquisitions: run(({ state }) => state.acquisitions.length >= ACQUISITION_IDS.length),
  // Only worth working out once the run earns something at all.
  market_half: run(({ state }) => {
    if (state.moneyEarned === 0) return false;
    return shareOf(state, mrrOf(state, gatherEffects(state)), loadOf(state)) >= 0.5;
  }),
  first_million: run(({ state }) => state.moneyEarned >= 1_000_000),
  first_billion: run(({ state }) => state.moneyEarned >= 1_000_000_000),
  sprints_50: run(({ state }) => state.sprint >= 50),
  account_level_10: account(({ level }) => level >= 10),
  account_tickets_1000: account(({ ticketsDelivered }) => ticketsDelivered >= 1000),

  works_on_my_machine: run(({ events }) =>
    has(events, "failure_event", (e) => e.eventId === "prod_bug"),
  ),
  liquid_cooling: run(({ events }) =>
    has(events, "upgrade_bought", (e) => e.id === "coffee_machine"),
  ),
  hack_won: run(({ events }) => has(events, "hack", (e) => e.success)),
  caught: run((context) => endedBy(context, "caught")),
  overheated: run((context) => endedBy(context, "burnout")),
  retired: run((context) => endedBy(context, "fired")),
  branch_wars: run(({ events }) => has(events, "conflict_resolved")),
  tough_month: run(({ events }) => has(events, "dev_left")),
  ultimate_question: run(({ state }) => state.ticketsDelivered >= 42),
  no_longer_required: run(
    ({ state }) => (state.upgrades.ai_supervisor ?? 0) >= (UPGRADES.ai_supervisor.maxLevel ?? 3),
  ),
  house_of_cards: run(({ events }) => has(events, "debt_explosion")),
  changes_requested: run(({ events }) => has(events, "pr_rejected")),
  hostile_takeover: run(({ events }) => has(events, "competitor_bought")),
};

/**
 * Everything the run now qualifies for. Nothing in a showcase: the landing
 * page's run is a picture, not the visitor's.
 */
export function achievementsInRun(context: AchievementContext): AchievementId[] {
  if (context.state.showcase !== null) return [];
  return ACHIEVEMENT_IDS.filter((id) => {
    const check = CHECKS[id];
    return check.source === "run" && check.earned(context);
  });
}

/** Everything the account's totals qualify for. */
export function achievementsOfAccount(progress: AccountProgress): AchievementId[] {
  return ACHIEVEMENT_IDS.filter((id) => {
    const check = CHECKS[id];
    return check.source === "account" && check.earned(progress);
  });
}
