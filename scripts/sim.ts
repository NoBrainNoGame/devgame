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

import { SKILLS } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { checkInvariants } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";
import {
  buggedOn,
  currentTicket,
  getTicket,
  openTickets,
  unreadAiOn,
} from "@/game/core/rules/tickets";
import { createRun, hashState } from "@/game/core/run";
import { computeScore } from "@/game/core/score";
import type { PlayerAction, RunState, Ticket } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

type PolicyName = "ai" | "craft" | "mixed" | "careful";

/** Turn-consuming actions before a run is declared unending. */
const MAX_TURNS = 1500;

interface Outcome {
  reason: "burnout" | "fired" | "stuck" | "capped";
  turns: number;
  sprints: number;
  score: number;
  commits: number;
  ticketsDelivered: number;
  carriedOver: number;
  forced: number;
  incidents: number;
  wipSum: number;
  finalDebt: number;
  maxDebt: number;
  reviews: number;
  failures: Record<string, number>;
}

function parseArgs(argv: string[]): {
  runs: number;
  policy: PolicyName | "all";
  seed: number;
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
  const open = openTickets(state);
  if (current === null || open.length < 2) return undefined;

  const remaining = (ticket: Ticket): number =>
    ticket.points - ticket.filled + (ticket.mustWrite ? -5 : 0);
  const best = open.reduce((a, b) => (remaining(b) < remaining(a) ? b : a));
  if (best.id === current.id) return undefined;

  return actions.find((a) => a.type === "checkout" && a.ticketId === best.id);
}

function choose(policy: PolicyName, state: RunState, actions: PlayerAction[]): PlayerAction {
  const isAi = (a: PlayerAction) => a.type === "commit" && a.mode === "ai" && a.kind === undefined;
  const isCraft = (a: PlayerAction) =>
    a.type === "commit" && a.mode === "craft" && a.kind === undefined;
  const isReview = (a: PlayerAction) => a.type === "review";
  const isSubmit = (a: PlayerAction) => a.type === "submit";
  const isDevops = (a: PlayerAction) => a.type === "devops";
  const writtenAs = (kind: string) => (a: PlayerAction) =>
    a.type === "commit" && a.kind === kind && a.mode === "craft";

  const ticket = currentTicket(state);
  const unreviewed = ticket === null ? 0 : unreadAiOn(state, ticket).length;
  const lowEnergy = state.player.energy <= 3;
  const fallback: PlayerAction = { type: "review" };

  // A point costs no turn, so any policy that ignores them is leaving value on
  // the table. Every policy takes them.
  const devops = actions.find(isDevops);
  if (devops !== undefined) return devops;

  const start = chooseStart(state, actions);
  if (start !== undefined) return start;

  // A rejection: start over when the fixes would cost more than the work
  // already done, carry on otherwise.
  if (state.phase.kind === "ticket_rejected") {
    return state.phase.bugs * 2 > (currentTicket(state)?.filled ?? 0)
      ? { type: "restart" }
      : { type: "resume" };
  }

  // The review flagged a commit: nothing else on this ticket goes anywhere
  // until a refactor has redone it, so every policy does that first.
  if (ticket !== null && buggedOn(state, ticket).length > 0) {
    const refactor = actions.find(writtenAs("refactor"));
    if (refactor !== undefined) return refactor;
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

function playOne(seed: string, policy: PolicyName, verbose: boolean): Outcome {
  let state = createRun({
    seed,
    mode: "classic",
    profileId: "junior",
    version: SAVE_VERSION,
  });

  const failures: Record<string, number> = {};
  let reviews = 0;
  let maxDebt = 0;
  let turns = 0;
  let incidents = 0;
  let forced = 0;
  let carriedOver = 0;
  let wipSum = 0;

  while (state.phase.kind !== "game_over" && turns < MAX_TURNS) {
    const actions = getAvailableActions(state);
    if (actions.length === 0) {
      return summarise(state, "stuck", {
        failures,
        reviews,
        maxDebt,
        incidents,
        forced,
        carriedOver,
        wipSum,
      });
    }

    const action = choose(policy, state, actions);
    const before = hashState(state);
    const result = applyAction(state, action);
    state = result.state;

    // A free action that changed nothing is a loop, not a game.
    if (hashState(state) === before) {
      return summarise(state, "stuck", {
        failures,
        reviews,
        maxDebt,
        incidents,
        forced,
        carriedOver,
        wipSum,
      });
    }

    maxDebt = Math.max(maxDebt, state.debt);

    for (const event of result.events) {
      if (event.type === "turn_started") {
        turns += 1;
        wipSum += Math.max(0, openTickets(state).length - 1);
      }
      if (event.type === "failure_event") {
        failures[event.eventId] = (failures[event.eventId] ?? 0) + 1;
      }
      if (event.type === "reviewed") reviews += 1;
      if (event.type === "incident") incidents += 1;
      if (event.type === "ticket_started" && event.forced) forced += 1;
      if (event.type === "sprint_ended") {
        carriedOver += openTickets(state).length;
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
        `t${state.turn} s${state.sprint}/${state.sprintTurn} ${label.padEnd(20)} e=${state.player.energy} debt=${state.debt} q=${state.quality} wip=${openTickets(state).length} ${ticket === null ? "-" : `${ticket.id} ${ticket.filled}/${ticket.points}`} ${state.phase.kind}`,
      );
    }
  }

  const reason = state.phase.kind === "game_over" ? state.phase.reason : "capped";
  return summarise(state, reason, {
    failures,
    reviews,
    maxDebt,
    incidents,
    forced,
    carriedOver,
    wipSum,
  });
}

function summarise(
  state: RunState,
  reason: Outcome["reason"],
  extra: Omit<
    Outcome,
    "reason" | "turns" | "sprints" | "score" | "commits" | "ticketsDelivered" | "finalDebt"
  >,
): Outcome {
  return {
    reason,
    turns: state.turn,
    sprints: Math.max(0, state.sprint - 1),
    score: computeScore(state),
    commits: state.player.totalCommits,
    ticketsDelivered: state.ticketsDelivered,
    finalDebt: state.debt,
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
  );
  console.log(
    `  debt      final avg ${mean(outcomes.map((o) => o.finalDebt)).toFixed(0)}  peak avg ${mean(outcomes.map((o) => o.maxDebt)).toFixed(0)}`,
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
  const outcome = playOne(`sim-${args.seed}`, policy, true);
  console.log("\n", outcome);
} else {
  checkGeneration(Math.min(500, args.runs * 2));

  const policies: PolicyName[] =
    args.policy === "all" ? ["ai", "craft", "mixed", "careful"] : [args.policy];

  for (const policy of policies) {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < args.runs; i++) {
      outcomes.push(playOne(`sim-${args.seed + i}`, policy, false));
    }
    report(policy, outcomes);
  }
}
