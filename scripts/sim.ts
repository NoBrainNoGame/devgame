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
 *
 * The players themselves live in `scripts/lib/policy.ts`, shared with the
 * fixtures loader.
 */

import { checkInvariants } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { capacityOf, loadOf, monthlyReport, mrrOf } from "@/game/core/rules/economy";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";
import { currentTicket, openTickets, playerTickets } from "@/game/core/rules/tickets";
import { createRun } from "@/game/core/run";
import { computeScore } from "@/game/core/score";
import type { RunState } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

import { choose, POLICY_NAMES, type PolicyName } from "./lib/policy";

/** Turn-consuming actions before a run is declared unending, unless `--turns` says otherwise. */
const DEFAULT_MAX_TURNS = 1500;

/** Free actions in a row before a run is declared looping. */
const MAX_FREE_STREAK = 200;
interface Outcome {
  reason: "burnout" | "fired" | "caught" | "stuck" | "capped";
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
  hacks: number;
  hacksWon: number;
  /** The run's share of the market at the end, in percent. */
  share: number;
  events: number;
  objectivesDone: number;
  objectivesFailed: number;
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
  let hacks = 0;
  let hacksWon = 0;
  let narrative = 0;
  let objectivesDone = 0;
  let objectivesFailed = 0;

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
        hacks,
        hacksWon,
        events: narrative,
        objectivesDone,
        objectivesFailed,
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
        hacks,
        hacksWon,
        events: narrative,
        objectivesDone,
        objectivesFailed,
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
      if (event.type === "narrative_opened") narrative += 1;
      if (event.type === "objective_done") objectivesDone += 1;
      if (event.type === "objective_failed") objectivesFailed += 1;
      if (event.type === "hack") {
        hacks += 1;
        if (event.success) hacksWon += 1;
      }
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
    hacks,
    hacksWon,
    events: narrative,
    objectivesDone,
    objectivesFailed,
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
    | "share"
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
    share: Math.round(monthlyReport(state, gatherEffects(state)).share * 100),
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
    `  money     earned avg ${mean(outcomes.map((o) => o.moneyEarned)).toFixed(0)}  mrr final avg ${mean(outcomes.map((o) => o.mrr)).toFixed(0)}  upgrades avg ${mean(outcomes.map((o) => o.upgrades)).toFixed(1)}  points bought avg ${mean(outcomes.map((o) => o.pointsBought)).toFixed(1)}  outages avg ${mean(outcomes.map((o) => o.outages)).toFixed(1)}  alerts avg ${mean(outcomes.map((o) => o.alerts)).toFixed(1)}  acquisitions avg ${mean(outcomes.map((o) => o.acquisitions)).toFixed(2)}  hacks avg ${mean(outcomes.map((o) => o.hacks)).toFixed(2)} won ${mean(outcomes.map((o) => o.hacksWon)).toFixed(2)}  share final med ${quantile(
      outcomes.map((o) => o.share),
      0.5,
    )}%  events avg ${mean(outcomes.map((o) => o.events)).toFixed(1)}  objectives met ${Math.round(
      (100 * outcomes.reduce((s, o) => s + o.objectivesDone, 0)) /
        Math.max(
          1,
          outcomes.reduce((s, o) => s + o.objectivesDone + o.objectivesFailed, 0),
        ),
    )}%`,
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

  const policies: PolicyName[] = args.policy === "all" ? [...POLICY_NAMES] : [args.policy];

  for (const policy of policies) {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < args.runs; i++) {
      outcomes.push(playOne(`sim-${args.seed + i}`, policy, args.turns, false));
    }
    report(policy, outcomes);
  }
}
