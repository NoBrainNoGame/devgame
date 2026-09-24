import {
  ACQUISITIONS,
  DEV_RANK,
  RELICS,
  type RelicId,
  SKILLS,
  type TreeNodeId,
  UPGRADES,
  type UpgradeId,
  upgradeCost,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { capacityAdvice } from "@/game/core/rules/capacity";
import { monthlyReport, projectedLoadOf } from "@/game/core/rules/economy";
import { gatherEffects, wipExtra } from "@/game/core/rules/modifiers";
import { skillPointPrice } from "@/game/core/rules/shop";
import { hireCostFor } from "@/game/core/rules/team";
import {
  buggedOn,
  currentTicket,
  getTicket,
  playerTickets,
  unreadAiOn,
} from "@/game/core/rules/tickets";
import type { PlayerAction, RunState, Ticket } from "@/game/core/types";

/**
 * The headless players: four fixed ways of pressing the buttons, one
 * manager shared by all of them. `bun run sim` measures the balance with
 * them, and `bun run fixtures` plays the runs the local database is seeded
 * with, so a fixture score is one the engine actually produced.
 *
 * Nothing here touches the engine's internals: every choice is one of the
 * actions the rules offer, and the log it leaves replays like a human's.
 */

export const POLICY_NAMES = ["ai", "craft", "mixed", "careful"] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];

/** Boosts, most wanted first: what is missing now before what pays later. */
const BOOST_PREFERENCE: RelicId[] = [
  "second_wind",
  "clean_slate",
  "postmortem",
  "grant",
  "intern",
  "bootcamp",
  "golden_quarter",
  "group_deal",
  "headhunter",
  "viral_thread",
  "review_party",
  "promotion",
  "grooming",
  "overtime",
  "big_client",
];

/** Picks the first action matching any of the given shapes. */
function prefer(actions: PlayerAction[], ...matchers: ((a: PlayerAction) => boolean)[]) {
  for (const matcher of matchers) {
    const found = actions.find(matcher);
    if (found !== undefined) return found;
  }
  return actions[0];
}

/**
 * Which ticket to start, when nothing is in hand.
 *
 * A ticket that teaches something the run cannot otherwise do outranks the
 * rest. Review is the case that matters: it does not exist until a ticket
 * grants it, so a policy that walked past the one offering it would be
 * measuring a player who does not read their own options. Otherwise the
 * cheapest ticket, delivered soonest.
 */
function chooseStart(state: RunState, actions: PlayerAction[]): PlayerAction | undefined {
  if (currentTicket(state) !== null) return undefined;

  const starts = actions.filter(
    (a): a is Extract<PlayerAction, { type: "start" }> => a.type === "start",
  );
  if (starts.length === 0) return undefined;

  const wantsReview = !gatherEffects(state).canReview;
  const score = (ticket: Ticket): number => {
    const teaches =
      ticket.skillId !== undefined && SKILLS[ticket.skillId].effects.canReview === true;
    if (wantsReview && teaches) return 1000;
    return (ticket.skillId === undefined ? 0 : 100) - ticket.points;
  };

  return starts.reduce((best, start) =>
    score(getTicket(state, start.ticketId)) > score(getTicket(state, best.ticketId)) ? start : best,
  );
}

/** The open ticket closest to landing, if it is not the one in hand. */
function chooseCheckout(state: RunState, actions: PlayerAction[]): PlayerAction | undefined {
  const current = currentTicket(state);
  const open = playerTickets(state);
  if (current === null || open.length < 2) return undefined;

  const remaining = (ticket: Ticket): number =>
    ticket.points - ticket.filled + (ticket.mustWrite ? -5 : 0);
  const best = open.reduce((a, b) => (remaining(b) < remaining(a) ? b : a));
  if (best.id === current.id) return undefined;

  return actions.find((a) => a.type === "checkout" && a.ticketId === best.id);
}

/** Tree nodes in the order the manager buys them. */
const TREE_ORDER: TreeNodeId[] = [
  "ci",
  "stamina",
  "luck",
  "monitoring",
  "growth_hacking",
  "recruiter",
  "agile_coach",
  "sre",
  "cd",
  "calm",
  "review_bot",
  "auto_linter",
  "dependabot",
  "auto_rebase",
  "mentoring",
];

/**
 * The manager: the cheapest rung that fits when production saturates, the
 * best rank the payroll can carry, a site once the month runs a surplus, a
 * skill point when the money is plentiful, otherwise the cheapest upgrade
 * going. Naive on purpose — it is the same for every policy.
 */
function manage(state: RunState, actions: PlayerAction[]): PlayerAction | undefined {
  const effects = gatherEffects(state);
  const report = monthlyReport(state, effects);
  const purchases = actions.filter(
    (a): a is Extract<PlayerAction, { type: "buy" }> => a.type === "buy",
  );
  const priceOf = (id: UpgradeId) => upgradeCost(id, state.upgrades[id] ?? 0) ?? Infinity;

  const reserve = report.upkeep + report.salaries;
  // Production about to pass the warning line: buy what the game itself
  // would advise, and buy nothing else until it can be afforded.
  const needed = projectedLoadOf(state) - (report.capacity * BALANCE.economy.infra.warnPct) / 100;
  if (needed > 0) {
    const advice = capacityAdvice(state, effects, needed);
    if (advice !== undefined) {
      const buy = purchases.find((a) => a.id === advice.id);
      return buy;
    }
  }

  const hires = actions.filter(
    (a): a is Extract<PlayerAction, { type: "hire" }> => a.type === "hire",
  );
  const hire = [...hires].sort((x, y) => DEV_RANK[y.rank].speed - DEV_RANK[x.rank].speed)[0];
  if (
    hire !== undefined &&
    report.net - DEV_RANK[hire.rank].salary >= 0 &&
    state.money - hireCostFor(effects, hire.rank) >= reserve
  ) {
    return hire;
  }

  // A company at twice its price in hand: the debt and the incident it
  // brings are paid for by the revenue it brings, if the money is there.
  const acquisition = actions.find(
    (a): a is Extract<PlayerAction, { type: "acquire" }> =>
      a.type === "acquire" && ACQUISITIONS[a.id].cost * 2 <= state.money,
  );
  if (acquisition !== undefined) return acquisition;

  if (report.net > 0) {
    const site = purchases.find(
      (a) => UPGRADES[a.id].category === "org" && priceOf(a.id) <= state.money / 2,
    );
    if (site !== undefined) return site;
  }

  if (state.money > 2 * skillPointPrice(state)) {
    const point = actions.find((a) => a.type === "buy_point");
    if (point !== undefined) return point;
  }

  // Infra is bought on advice only: a rich run would otherwise stack servers
  // it does not need, one free action at a time, forever.
  const affordable = purchases
    .filter((a) => UPGRADES[a.id].category !== "infra")
    .map((a) => ({ a, cost: priceOf(a.id) }))
    .filter(({ cost }) => cost <= state.money / 2)
    .sort((x, y) => x.cost - y.cost)[0];
  return affordable?.a;
}

export function choose(policy: PolicyName, state: RunState, actions: PlayerAction[]): PlayerAction {
  const isAi = (a: PlayerAction) => a.type === "commit" && a.mode === "ai" && a.kind === undefined;
  const isCraft = (a: PlayerAction) =>
    a.type === "commit" && a.mode === "craft" && a.kind === undefined;
  const isReview = (a: PlayerAction) => a.type === "review";
  const isRest = (a: PlayerAction) => a.type === "rest";
  const isSubmit = (a: PlayerAction) => a.type === "submit";
  const writtenAs = (kind: string) => (a: PlayerAction) =>
    a.type === "commit" && a.kind === kind && a.mode === "craft";

  // The reckless hands take the hack when it is offered; the careful ones
  // never do. What the coin costs each is what the report compares.
  if (policy === "ai" || policy === "mixed") {
    const hack = actions.find((a) => a.type === "hack");
    if (hack !== undefined) return hack;
  }

  const ticket = currentTicket(state);
  const unreviewed = ticket === null ? 0 : unreadAiOn(state, ticket).length;
  const lowEnergy = state.player.energy <= 3;
  const fallback: PlayerAction = { type: "review" };

  // A point costs no turn, so any policy that ignores them is leaving value on
  // the table. Every policy takes them, in a fixed order of preference.
  const tree = TREE_ORDER.map((id) => actions.find((a) => a.type === "tree" && a.id === id)).find(
    (a) => a !== undefined,
  );
  if (tree !== undefined) return tree;

  // The shop is free in time too. One manager for every policy, so a policy
  // is still about how it writes commits.
  const bought = manage(state, actions);
  if (bought !== undefined) return bought;

  const start = chooseStart(state, actions);
  if (start !== undefined) return start;

  // The sprint bonus: a keep while any is offered — they never come back —
  // then the boosts in the order a player who reads the cards would want.
  if (state.phase.kind === "choose_relic") {
    const offered = actions.filter((a) => a.type === "choose_relic");
    const keep = offered.find((a) => RELICS[a.relicId].kind === "keep");
    if (keep !== undefined) return keep;
    const ranked = [...offered].sort(
      (a, b) => BOOST_PREFERENCE.indexOf(a.relicId) - BOOST_PREFERENCE.indexOf(b.relicId),
    );
    if (ranked[0] !== undefined) return ranked[0];
  }

  // An acceptance has one answer; a question takes the first. A full
  // obstacle lands back on its feature the same way.
  if (state.phase.kind === "pr_accepted") return { type: "merge" };
  const landObstacle = actions.find((a) => a.type === "merge");
  if (landObstacle !== undefined) return landObstacle;
  if (state.phase.kind === "event") {
    const answer = actions.find((a) => a.type === "answer");
    if (answer !== undefined) return answer;
  }

  // A rejection: start over when the fixes would cost more than the work
  // already done, carry on otherwise.
  if (state.phase.kind === "ticket_rejected") {
    return state.phase.bugs * 2 > (currentTicket(state)?.filled ?? 0)
      ? { type: "restart" }
      : { type: "resume" };
  }

  // The review flagged a commit: nothing else on this ticket goes anywhere
  // until a fix has redone it, so every policy does that first.
  if (ticket !== null && buggedOn(state, ticket).length > 0) {
    const fix = actions.find(writtenAs("fix"));
    if (fix !== undefined) return fix;
  }

  // Ready to submit. The reviewer catches unread machine work and refuses an
  // indebted codebase, so a policy that reads its options cleans up first:
  // review until nothing is unread, refactor under the ceiling, then submit.
  // The naive `ai` policy submits blind and pays for it.
  const submit = actions.find(isSubmit);
  if (submit !== undefined) {
    if (policy !== "ai") {
      if (unreviewed > 0) {
        const review = actions.find(isReview);
        if (review !== undefined) return review;
        const squash = actions.find(writtenAs("squash"));
        if (squash !== undefined) return squash;
      }
      if (state.debt > BALANCE.acceptance.maxDebt) {
        const refactor = actions.find(writtenAs("refactor"));
        if (refactor !== undefined) return refactor;
      }
    }
    return submit;
  }

  const checkout = chooseCheckout(state, actions);
  if (checkout !== undefined) return checkout;

  if (policy === "mixed" || policy === "careful") {
    if (state.debt >= 40) {
      const refactor = actions.find(writtenAs("refactor"));
      if (refactor !== undefined) return refactor;
    }
    if (unreviewed >= 3) {
      const squash = actions.find(writtenAs("squash"));
      if (squash !== undefined) return squash;
    }
    if (state.debt < 20) {
      const rebase = actions.find(writtenAs("rebase"));
      if (rebase !== undefined) return rebase;
    }
  }

  // Out of breath: everyone but the naive machine player takes a turn off,
  // when the board still leaves room to rest.
  const restWorth = BALANCE.energy.restRegen - wipExtra(state) >= 3;
  if (policy !== "ai" && lowEnergy && restWorth) {
    const rest = actions.find(isRest);
    if (rest !== undefined) return rest;
  }

  switch (policy) {
    case "ai":
      return prefer(actions, isAi, isCraft) ?? fallback;

    case "craft":
      return prefer(actions, isCraft, isAi) ?? fallback;

    case "mixed":
      if (unreviewed >= 3) return prefer(actions, isReview, isAi) ?? fallback;
      return prefer(actions, isAi, isCraft) ?? fallback;

    case "careful":
      if (unreviewed >= 2) return prefer(actions, isReview, isCraft) ?? fallback;
      if (lowEnergy) return prefer(actions, isAi, isCraft) ?? fallback;
      return prefer(actions, isCraft, isAi) ?? fallback;
  }
}

/**
 * The player who walks away: every turn goes to the dearest commit by hand,
 * no ticket is ever landed, no breath is ever taken, and the run ends in
 * burnout within a sprint or two. The fixtures use it to end a run that the
 * patient policies would otherwise keep alive for ever, at the sprint the
 * catalogue says the player gave up.
 */
export function chooseQuit(state: RunState, actions: PlayerAction[]): PlayerAction {
  const find = (predicate: (a: PlayerAction) => boolean): PlayerAction | undefined =>
    actions.find(predicate);
  const craftOf = (kind: string) => (a: PlayerAction) =>
    a.type === "commit" && a.mode === "craft" && a.kind === kind;

  // Phases with one way out, or a question to answer, take the first offer.
  const forced =
    find((a) => a.type === "merge") ??
    find((a) => a.type === "answer") ??
    find((a) => a.type === "choose_relic") ??
    find((a) => a.type === "resume") ??
    find((a) => a.type === "resolve_conflict");
  if (forced !== undefined) return forced;

  if (currentTicket(state) === null) {
    const open = find((a) => a.type === "start") ?? find((a) => a.type === "checkout");
    if (open !== undefined) return open;
  }

  const spend =
    find(craftOf("docs")) ??
    find(craftOf("refactor")) ??
    find(craftOf("squash")) ??
    find((a) => a.type === "commit" && a.mode === "craft") ??
    find((a) => a.type === "commit") ??
    find((a) => a.type === "review") ??
    find((a) => a.type !== "rest" && a.type !== "submit" && a.type !== "hack");
  return spend ?? actions[0] ?? { type: "rest" };
}
