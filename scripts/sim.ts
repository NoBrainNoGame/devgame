/**
 * Headless balance simulator.
 *
 *   bun run sim                       200 runs, every policy
 *   bun run sim --runs 500 --policy ai
 *   bun run sim --seed 42 --verbose   one run, printed turn by turn
 *
 * The numbers in `balance.ts` are guesses until this says otherwise. What it is
 * looking for: runs that never end, runs that end instantly, a failure that
 * never fires, and a policy that dominates every other.
 */

import {
  ACQUISITIONS,
  DEV_RANK,
  SKILLS,
  type TreeNodeId,
  UPGRADES,
  type UpgradeId,
  upgradeCost,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { checkInvariants } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { capacityAdvice } from "@/game/core/rules/capacity";
import {
  capacityOf,
  loadOf,
  monthlyReport,
  mrrOf,
  projectedLoadOf,
} from "@/game/core/rules/economy";
import { gatherEffects, wipExtra } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";
import { skillPointPrice } from "@/game/core/rules/shop";
import { hireCostFor } from "@/game/core/rules/team";
import {
  buggedOn,
  currentTicket,
  getTicket,
  openTickets,
  playerTickets,
  unreadAiOn,
} from "@/game/core/rules/tickets";
import { createRun } from "@/game/core/run";
import { computeScore } from "@/game/core/score";
import type { PlayerAction, RunState, Ticket } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

type PolicyName = "ai" | "craft" | "mixed" | "careful";

/** Turn-consuming actions before a run is declared unending, unless `--turns` says otherwise. */
const DEFAULT_MAX_TURNS = 1500;

/** Free actions in a row before a run is declared looping. */
const MAX_FREE_STREAK = 200;

interface Outcome {
  reason: "burnout" | "fired" | "stuck" | "capped";
  turns: number;
  sprints: number;
  score: number;
  commits: number;
  ticketsDelivered: number;
  pointsDelivered: number;
  rests: number;
  carriedOver: number;
  forced: number;
  incidents: number;
  wipSum: number;
  finalDebt: number;
  maxDebt: number;
  reviews: number;
  failures: Record<string, number>;
  /** The management game: what was earned, bought and hired. */
  moneyEarned: number;
  mrr: number;
  hires: number;
  devsLeft: number;
  teamDelivered: number;
  outages: number;
  upgrades: number;
  pointsBought: number;
  /** The orders of magnitude: where the run got to, and how high the pile went. */
  tier: number;
  acquisitions: number;
  alerts: number;
  /** The tier the run had reached when sprint 10 ended, or its last one. */
  tierAt10: number;
  moneyPeak: number;
  cause: string;
}

function parseArgs(argv: string[]): {
  runs: number;
  policy: PolicyName | "all";
  seed: number;
  turns: number;
  verbose: boolean;
} {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };

  return {
    runs: Number(get("--runs") ?? 200),
    policy: (get("--policy") ?? "all") as PolicyName | "all",
    seed: Number(get("--seed") ?? 1),
    turns: Number(get("--turns") ?? DEFAULT_MAX_TURNS),
    verbose: argv.includes("--verbose"),
  };
}

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

function choose(policy: PolicyName, state: RunState, actions: PlayerAction[]): PlayerAction {
  const isAi = (a: PlayerAction) => a.type === "commit" && a.mode === "ai" && a.kind === undefined;
  const isCraft = (a: PlayerAction) =>
    a.type === "commit" && a.mode === "craft" && a.kind === undefined;
  const isReview = (a: PlayerAction) => a.type === "review";
  const isRest = (a: PlayerAction) => a.type === "rest";
  const isSubmit = (a: PlayerAction) => a.type === "submit";
  const writtenAs = (kind: string) => (a: PlayerAction) =>
    a.type === "commit" && a.kind === kind && a.mode === "craft";

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

  // An acceptance has one answer.
  if (state.phase.kind === "pr_accepted") return { type: "merge" };

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

function playOne(seed: string, policy: PolicyName, maxTurns: number, verbose: boolean): Outcome {
  let state = createRun({
    seed,
    mode: "classic",
    profileId: "junior",
    version: SAVE_VERSION,
  });

  const failures: Record<string, number> = {};
  let reviews = 0;
  let rests = 0;
  let maxDebt = 0;
  let turns = 0;
  let incidents = 0;
  let forced = 0;
  let carriedOver = 0;
  let wipSum = 0;
  let hires = 0;
  let devsLeft = 0;
  let teamDelivered = 0;
  let outages = 0;
  let upgrades = 0;
  let pointsBought = 0;
  let moneyPeak = 0;
  let freeStreak = 0;
  let tierAt10 = -1;
  let alerts = 0;

  while (state.phase.kind !== "game_over" && turns < maxTurns) {
    const actions = getAvailableActions(state);
    if (actions.length === 0) {
      return summarise(state, "stuck", {
        failures,
        reviews,
        rests,
        maxDebt,
        incidents,
        forced,
        carriedOver,
        wipSum,
        hires,
        devsLeft,
        teamDelivered,
        outages,
        upgrades,
        pointsBought,
        moneyPeak,
        alerts,
        tierAt10: tierAt10 === -1 ? state.tier : tierAt10,
      });
    }

    const action = choose(policy, state, actions);
    const turnBefore = state.turn;
    const result = applyAction(state, action);
    state = result.state;

    // Free actions are fine; two hundred in a row without a turn passing is
    // a loop, not a game. Cheaper than hashing a late run's state each move.
    freeStreak = state.turn === turnBefore ? freeStreak + 1 : 0;
    if (freeStreak > MAX_FREE_STREAK) {
      return summarise(state, "stuck", {
        failures,
        reviews,
        rests,
        maxDebt,
        incidents,
        forced,
        carriedOver,
        wipSum,
        hires,
        devsLeft,
        teamDelivered,
        outages,
        upgrades,
        pointsBought,
        moneyPeak,
        alerts,
        tierAt10: tierAt10 === -1 ? state.tier : tierAt10,
      });
    }

    maxDebt = Math.max(maxDebt, state.debt);
    moneyPeak = Math.max(moneyPeak, state.money);

    for (const event of result.events) {
      if (event.type === "turn_started") {
        turns += 1;
        wipSum += Math.max(0, playerTickets(state).length - 1);
      }
      if (event.type === "failure_event") {
        failures[event.eventId] = (failures[event.eventId] ?? 0) + 1;
      }
      if (event.type === "reviewed") reviews += 1;
      if (event.type === "rested") rests += 1;
      if (event.type === "incident") incidents += 1;
      if (event.type === "ticket_started" && event.forced) forced += 1;
      if (event.type === "sprint_ended") {
        carriedOver += openTickets(state).length;
        if (state.sprint === 10) tierAt10 = state.tier;
      }
      if (event.type === "hired") hires += 1;
      if (event.type === "dev_left") devsLeft += 1;
      if (event.type === "ticket_merged" && event.devId !== undefined) teamDelivered += 1;
      if (event.type === "outage") outages += 1;
      if (event.type === "upgrade_bought") upgrades += 1;
      if (event.type === "skill_point_bought") pointsBought += 1;
      if (event.type === "capacity_warning") alerts += 1;
      if (verbose && event.type === "month_closed") {
        const effects = gatherEffects(state);
        console.log(
          `  ── month ${event.month}: tier ${state.tier} revenue ${event.revenue} lost ${event.lost} upkeep ${event.upkeep} salaries ${event.salaries} → $${event.money}  load ${loadOf(state)}/${capacityOf(effects)}  q=${state.quality}`,
        );
      }
    }

    if (verbose) {
      const label =
        action.type === "commit"
          ? `commit:${action.mode}${action.kind === undefined ? "" : `:${action.kind}`}`
          : action.type === "start" || action.type === "checkout"
            ? `${action.type}:${action.ticketId}`
            : action.type;
      const ticket = currentTicket(state);
      console.log(
        `t${state.turn} s${state.sprint}/${state.sprintTurn} ${label.padEnd(20)} e=${state.player.energy} debt=${state.debt} q=${state.quality} wip=${playerTickets(state).length} $=${state.money} ${ticket === null ? "-" : `${ticket.id} ${ticket.filled}/${ticket.points}`} ${state.phase.kind}`,
      );
    }
  }

  const reason = state.phase.kind === "game_over" ? state.phase.reason : "capped";
  return summarise(state, reason, {
    failures,
    reviews,
    rests,
    maxDebt,
    incidents,
    forced,
    carriedOver,
    wipSum,
    hires,
    devsLeft,
    teamDelivered,
    outages,
    upgrades,
    pointsBought,
    moneyPeak,
    alerts,
    tierAt10: tierAt10 === -1 ? state.tier : tierAt10,
  });
}

function summarise(
  state: RunState,
  reason: Outcome["reason"],
  extra: Omit<
    Outcome,
    | "reason"
    | "turns"
    | "sprints"
    | "score"
    | "commits"
    | "ticketsDelivered"
    | "pointsDelivered"
    | "finalDebt"
    | "moneyEarned"
    | "mrr"
    | "tier"
    | "cause"
    | "acquisitions"
  >,
): Outcome {
  return {
    reason,
    turns: state.turn,
    sprints: Math.max(0, state.sprint - 1),
    score: computeScore(state),
    commits: state.player.totalCommits,
    ticketsDelivered: state.ticketsDelivered,
    pointsDelivered: state.pointsDelivered,
    finalDebt: state.debt,
    moneyEarned: state.moneyEarned,
    mrr: mrrOf(state, gatherEffects(state)),
    tier: state.tier,
    acquisitions: state.acquisitions.length,
    cause: state.phase.kind === "game_over" ? (state.phase.cause ?? "-") : "-",
    ...extra,
  };
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index] ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function report(policy: string, outcomes: Outcome[]): void {
  const reasons: Record<string, number> = {};
  const failures: Record<string, number> = {};
  for (const outcome of outcomes) {
    reasons[outcome.reason] = (reasons[outcome.reason] ?? 0) + 1;
    for (const [id, count] of Object.entries(outcome.failures)) {
      failures[id] = (failures[id] ?? 0) + count;
    }
  }

  const turns = outcomes.map((o) => o.turns);
  const scores = outcomes.map((o) => o.score);
  const totalTurns = Math.max(
    1,
    turns.reduce((a, b) => a + b, 0),
  );

  console.log(`\n── ${policy} ── ${outcomes.length} runs`);
  console.log(
    `  ends      ${Object.entries(reasons)
      .sort()
      .map(([k, v]) => `${k} ${Math.round((v / outcomes.length) * 100)}%`)
      .join("  ")}`,
  );
  console.log(
    `  turns     med ${quantile(turns, 0.5)}  p10 ${quantile(turns, 0.1)}  p90 ${quantile(turns, 0.9)}`,
  );
  console.log(
    `  score     med ${quantile(scores, 0.5)}  p90 ${quantile(scores, 0.9)}  max ${Math.max(...scores)}`,
  );
  console.log(
    `  sprints   avg ${mean(outcomes.map((o) => o.sprints)).toFixed(2)}   tickets delivered avg ${mean(outcomes.map((o) => o.ticketsDelivered)).toFixed(1)}  carried over avg ${mean(outcomes.map((o) => o.carriedOver)).toFixed(1)}  forced avg ${mean(outcomes.map((o) => o.forced)).toFixed(1)}`,
  );
  console.log(
    `  wip       avg ${(outcomes.reduce((s, o) => s + o.wipSum, 0) / totalTurns).toFixed(2)} extra tickets per turn   incidents avg ${mean(outcomes.map((o) => o.incidents)).toFixed(2)}`,
    `  points    delivered avg ${mean(outcomes.map((o) => o.pointsDelivered)).toFixed(1)}   per turn ${(outcomes.reduce((s, o) => s + o.pointsDelivered, 0) / totalTurns).toFixed(2)}   rests avg ${mean(outcomes.map((o) => o.rests)).toFixed(1)}`,
  );
  console.log(
    `  debt      final avg ${mean(outcomes.map((o) => o.finalDebt)).toFixed(0)}  peak avg ${mean(outcomes.map((o) => o.maxDebt)).toFixed(0)}`,
  );
  console.log(
    `  tiers     reached med ${quantile(
      outcomes.map((o) => o.tier),
      0.5,
    )}  max ${Math.max(...outcomes.map((o) => o.tier))}  at sprint 10 med ${quantile(
      outcomes.map((o) => o.tierAt10),
      0.5,
    )}  money peak med ${quantile(
      outcomes.map((o) => o.moneyPeak),
      0.5,
    )}  fired by ${Object.entries(
      outcomes.reduce<Record<string, number>>((acc, o) => {
        if (o.reason === "fired") acc[o.cause] = (acc[o.cause] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(" ")}`,
  );
  console.log(
    `  money     earned avg ${mean(outcomes.map((o) => o.moneyEarned)).toFixed(0)}  mrr final avg ${mean(outcomes.map((o) => o.mrr)).toFixed(0)}  upgrades avg ${mean(outcomes.map((o) => o.upgrades)).toFixed(1)}  points bought avg ${mean(outcomes.map((o) => o.pointsBought)).toFixed(1)}  outages avg ${mean(outcomes.map((o) => o.outages)).toFixed(1)}  alerts avg ${mean(outcomes.map((o) => o.alerts)).toFixed(1)}  acquisitions avg ${mean(outcomes.map((o) => o.acquisitions)).toFixed(2)}`,
  );
  console.log(
    `  team      hires avg ${mean(outcomes.map((o) => o.hires)).toFixed(2)}  left avg ${mean(outcomes.map((o) => o.devsLeft)).toFixed(2)}  delivered by team avg ${mean(outcomes.map((o) => o.teamDelivered)).toFixed(1)}  by player avg ${mean(outcomes.map((o) => o.ticketsDelivered - o.teamDelivered)).toFixed(1)}`,
  );
  console.log(
    `  failures  ${Object.entries(failures)
      .sort()
      .map(([k, v]) => `${k} ${v}`)
      .join("  ")}`,
  );
}

/** Plays a few turns per seed and checks the graph each one produces. */
function checkGeneration(count: number): void {
  let broken = 0;
  const nodeCounts: number[] = [];

  for (let i = 0; i < count; i++) {
    let state = createRun({
      seed: `gen-${i}`,
      mode: "classic",
      profileId: "junior",
      version: SAVE_VERSION,
    });
    for (let step = 0; step < 40 && state.phase.kind !== "game_over"; step += 1) {
      const actions = getAvailableActions(state);
      const action = choose("mixed", state, actions);
      state = applyAction(state, action).state;
    }

    const failures = checkInvariants(state);
    if (failures.length > 0) {
      broken += 1;
      if (broken <= 3) console.log(`  seed gen-${i}:`, failures.slice(0, 3));
    }
    nodeCounts.push(Object.keys(state.nodes).length);
  }

  console.log(`\n── generation ── ${count} runs of 40 actions`);
  console.log(`  invariant failures  ${broken}`);
  console.log(`  nodes written       avg ${mean(nodeCounts).toFixed(1)}`);
}

const args = parseArgs(Bun.argv.slice(2));

if (args.verbose) {
  const policy: PolicyName = args.policy === "all" ? "mixed" : args.policy;
  const outcome = playOne(`sim-${args.seed}`, policy, args.turns, true);
  console.log("\n", outcome);
} else {
  checkGeneration(Math.min(500, args.runs * 2));

  const policies: PolicyName[] =
    args.policy === "all" ? ["ai", "craft", "mixed", "careful"] : [args.policy];

  for (const policy of policies) {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < args.runs; i++) {
      outcomes.push(playOne(`sim-${args.seed + i}`, policy, args.turns, false));
    }
    report(policy, outcomes);
  }
}
