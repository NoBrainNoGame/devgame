/**
 * Headless balance simulator.
 *
 *   bun run sim                       200 runs, mixed policy
 *   bun run sim --runs 500 --policy ai
 *   bun run sim --seed 42 --verbose   one run, printed turn by turn
 *
 * The numbers in `balance.ts` are guesses until this says otherwise. What it is
 * looking for: runs that never end, runs that end instantly, a failure that
 * never fires, and a policy that dominates every other.
 */

import { SKILLS } from "@/game/content";
import { checkInvariants } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { gatherEffects } from "@/game/core/rules/modifiers";
import { applyAction } from "@/game/core/rules/reducer";
import { createRun } from "@/game/core/run";
import { computeScore } from "@/game/core/score";
import type { PlayerAction, RunState } from "@/game/core/types";
import { SAVE_VERSION } from "@/game/dto/version";

type PolicyName = "ai" | "craft" | "mixed" | "careful";

const MAX_ITERATIONS = 4000;

interface Outcome {
  reason: "burnout" | "fired" | "stuck" | "capped";
  turns: number;
  sprints: number;
  score: number;
  commits: number;
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
 * Which feature to build. Every choice is one now — the graph walks a forced
 * step by itself — so this is purely "which branch".
 *
 * A branch that teaches something the run cannot otherwise do outranks the
 * rest. Review is the case that matters: it does not exist until a branch
 * grants it, so a policy that walked past the one offering it would be
 * measuring a player who does not read their own options.
 */
function chooseMove(state: RunState, actions: PlayerAction[]): PlayerAction | undefined {
  const moves = actions.filter(
    (a): a is Extract<PlayerAction, { type: "move" }> => a.type === "move",
  );
  if (moves.length === 0) return undefined;

  const wantsReview = !gatherEffects(state).canReview;

  const branchTeaches = (nodeId: string): boolean => {
    const branchId = state.nodes[nodeId]?.branchId;
    const skillId = branchId === undefined ? undefined : state.branches[branchId]?.skillId;
    return skillId !== undefined && SKILLS[skillId].effects.canReview === true;
  };

  const score = (nodeId: string): number => {
    const node = state.nodes[nodeId];
    if (node === undefined) return 0;
    if (wantsReview && branchTeaches(nodeId)) return 9;
    // Otherwise: a branch that grants anything beats one that grants nothing,
    // and the shorter of two plain branches beats the longer.
    const branchId = node.branchId;
    const branch = branchId === undefined ? undefined : state.branches[branchId];
    return branch?.skillId !== undefined ? 5 : 3;
  };

  return moves.reduce((best, move) => (score(move.nodeId) > score(best.nodeId) ? move : best));
}

function choose(policy: PolicyName, state: RunState, actions: PlayerAction[]): PlayerAction {
  const isAi = (a: PlayerAction) => a.type === "commit" && a.mode === "ai" && a.kind === undefined;
  const isCraft = (a: PlayerAction) =>
    a.type === "commit" && a.mode === "craft" && a.kind === undefined;
  const isReview = (a: PlayerAction) => a.type === "review";
  const isDevops = (a: PlayerAction) => a.type === "devops";
  const writtenAs = (kind: string) => (a: PlayerAction) =>
    a.type === "commit" && a.kind === kind && a.mode === "craft";
  const unreviewed = state.player.aiHistory.filter((e) => !e.reviewed).length;
  const lowEnergy = state.player.energy <= 3;

  // A point costs no turn, so any policy that ignores them is leaving value on
  // the table. Every policy takes them.
  const devops = actions.find(isDevops);
  if (devops !== undefined) return devops;

  const move = chooseMove(state, actions);
  if (move !== undefined) return move;

  // What this commit could be written as instead. The two committed policies
  // never take one — that is what makes them the extremes — but a player who
  // reads their options does, and the numbers are meant to describe a player.
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
    const docs = actions.find(writtenAs("docs"));
    if (docs !== undefined) return docs;
  }

  switch (policy) {
    case "ai":
      return prefer(actions, isAi, isCraft) ?? actions[0] ?? { type: "review" };

    case "craft":
      return prefer(actions, isCraft, isAi) ?? actions[0] ?? { type: "review" };

    case "mixed":
      if (unreviewed >= 3)
        return prefer(actions, isReview, isAi) ?? actions[0] ?? { type: "review" };
      return prefer(actions, isAi, isCraft) ?? actions[0] ?? { type: "review" };

    case "careful":
      if (unreviewed >= 2)
        return prefer(actions, isReview, isCraft) ?? actions[0] ?? { type: "review" };
      if (lowEnergy) return prefer(actions, isAi, isCraft) ?? actions[0] ?? { type: "review" };
      return prefer(actions, isCraft, isAi) ?? actions[0] ?? { type: "review" };
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
  let iterations = 0;

  while (state.phase.kind !== "game_over" && iterations < MAX_ITERATIONS) {
    const actions = getAvailableActions(state);
    if (actions.length === 0) {
      return summarise(state, "stuck", { failures, reviews, maxDebt });
    }

    const action = choose(policy, state, actions);
    const result = applyAction(state, action);
    state = result.state;
    iterations += 1;
    maxDebt = Math.max(maxDebt, state.debt);

    for (const event of result.events) {
      if (event.type === "failure_event") {
        failures[event.eventId] = (failures[event.eventId] ?? 0) + 1;
      }
      if (event.type === "reviewed") reviews += 1;
    }

    if (verbose) {
      const label = action.type === "commit" ? `commit:${action.mode}` : action.type;
      console.log(
        `t${state.turn} s${state.sprint} ${label.padEnd(14)} e=${state.player.energy} debt=${state.debt} ${state.phase.kind}`,
      );
    }
  }

  const reason = state.phase.kind === "game_over" ? state.phase.reason : "capped";
  return summarise(state, reason, { failures, reviews, maxDebt });
}

function summarise(
  state: RunState,
  reason: Outcome["reason"],
  extra: { failures: Record<string, number>; reviews: number; maxDebt: number },
): Outcome {
  return {
    reason,
    turns: state.turn,
    sprints: Math.max(0, state.sprint - 1),
    score: computeScore(state),
    commits: state.player.totalCommits,
    finalDebt: state.debt,
    maxDebt: extra.maxDebt,
    reviews: extra.reviews,
    failures: extra.failures,
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
  console.log(`  sprints   avg ${mean(outcomes.map((o) => o.sprints)).toFixed(2)}`);
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

function checkGeneration(count: number): void {
  let broken = 0;
  const lengths: number[] = [];
  const nodeCounts: number[] = [];
  const choicePoints: number[] = [];

  for (let i = 0; i < count; i++) {
    const state = createRun({
      seed: `gen-${i}`,
      mode: "classic",
      profileId: "junior",
      version: SAVE_VERSION,
    });
    const nodes = Object.values(state.nodes);
    const failures = checkInvariants(nodes);
    if (failures.length > 0) {
      broken += 1;
      if (broken <= 3) console.log(`  seed gen-${i}:`, failures.slice(0, 3));
    }
    lengths.push(state.sprintLength);
    nodeCounts.push(nodes.length);
    choicePoints.push(nodes.filter((node) => node.next.length > 1).length);
  }

  console.log(`\n── generation ── ${count} sprints`);
  console.log(`  invariant failures  ${broken}`);
  console.log(
    `  main length         min ${Math.min(...lengths)} max ${Math.max(...lengths)} avg ${mean(lengths).toFixed(1)}`,
  );
  console.log(`  nodes per sprint    avg ${mean(nodeCounts).toFixed(1)}`);
  console.log(
    `  choice points       avg ${mean(choicePoints).toFixed(1)}  min ${Math.min(...choicePoints)}`,
  );
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
