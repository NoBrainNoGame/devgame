import { BALANCE } from "@/game/core/balance";
import { getNode, setCandidates, successors } from "@/game/core/map/graph";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt, repayDebt, shouldExplode } from "@/game/core/rules/debt";
import { gainEnergy, spendEnergy } from "@/game/core/rules/energy";
import { drawAmbient, injectRefactor } from "@/game/core/rules/events";
import { grantSkill } from "@/game/core/rules/grants";
import { nodeEnergyCost } from "@/game/core/rules/modifiers";
import { recordAiCommit } from "@/game/core/rules/review";
import type { CommitMode, MapNode, NodeId } from "@/game/core/types";

/**
 * Walking the graph: resolving a node, spilling forward when the machine wrote
 * more than you asked for, and working out where you may go next.
 *
 * Merges are not rolled for. Arriving at one resolves it: the design calls a
 * merge "the rest", and a rest you can fail is not a rest.
 */

export type AfterResolution = "continue" | "sprint_end" | "refactor_forced";

/** Marks the node the player stands on as done, with everything that implies. */
export function resolveNode(
  context: RuleContext,
  node: MapNode,
  mode: CommitMode,
  options: { primary: boolean } = { primary: true },
): void {
  const { state } = context;
  const { debt } = BALANCE;

  node.status = "done";
  node.commit = { mode, reviewed: mode === "craft" };

  state.player.nodeId = node.id;
  state.player.totalCommits += 1;
  state.player.sprintProgress += 1;

  if (mode === "ai") {
    addDebt(context, options.primary ? debt.perAiCommit : debt.perAiJumpNode);
    recordAiCommit(context, node.id);
  } else {
    state.player.aiChain = 0;
  }

  if (node.kind === "risky") addDebt(context, debt.perRiskyNode);

  if (node.kind === "refactor") {
    repayDebt(context, debt.refactorRepay);
    state.player.freeRefactor = false;
  }

  if (node.kind === "chore") drawAmbient(context);

  emit(context, { type: "node_done", nodeId: node.id, mode, kind: node.kind });

  if (node.branchId !== undefined) closeBranchIfDone(context, node);
}

/**
 * A branch is merged the moment its last node resolves — not when every node in
 * it has been walked.
 *
 * The difference matters because a sub-branch is an alternative route through
 * its parent: taking it deliberately skips some of the parent's nodes. Requiring
 * all of them left the branch open for the rest of the run, silently swallowed
 * the skill it promised, and kept `isOverextended` true forever.
 */
function closeBranchIfDone(context: RuleContext, node: MapNode): void {
  const branchId = node.branchId;
  if (branchId === undefined) return;

  const branch = context.state.branches[branchId];
  if (branch === undefined || branch.merged) return;

  const last = branch.nodeIds[branch.nodeIds.length - 1];
  if (last !== node.id) return;

  branch.merged = true;
  branch.open = false;

  emit(context, {
    type: "branch_merged",
    branchId,
    ...(branch.skillId === undefined ? {} : { skillId: branch.skillId }),
  });

  if (branch.skillId !== undefined) grantSkill(context, branch.skillId);
}

/**
 * A successful AI commit keeps going on its own. It stops at anything that is
 * a decision or a milestone — the machine writes the boring parts, not the
 * ones you would want a say in.
 */
export function autoWalk(context: RuleContext, jumps: number): NodeId[] {
  const walked: NodeId[] = [];

  for (let i = 0; i < jumps; i++) {
    const current = getNode(context.state, context.state.player.nodeId);
    const nexts = successors(context.state, current.id);

    if (nexts.length !== 1) break;
    const next = nexts[0];
    if (next === undefined || next.status === "done") break;
    if (!isAutoWalkable(next)) break;

    resolveNode(context, next, "ai", { primary: false });
    walked.push(next.id);
  }

  if (walked.length > 0) emit(context, { type: "ai_jumped", nodeIds: walked });
  return walked;
}

function isAutoWalkable(node: MapNode): boolean {
  return node.kind === "commit" || node.kind === "feature" || node.kind === "hotfix";
}

/**
 * Steps onto `nodeId`. Merges, releases and sprint anchors resolve on arrival;
 * everything else waits for the player to decide how to write it.
 */
export function arriveAt(context: RuleContext, nodeId: NodeId): AfterResolution {
  const { state } = context;
  const from = state.player.nodeId;
  const node = getNode(state, nodeId);

  state.player.nodeId = nodeId;
  node.status = "current";
  emit(context, { type: "player_moved", from, to: nodeId });

  openBranchOf(context, node);

  switch (node.kind) {
    case "feature_merge": {
      const cost = nodeEnergyCost(state, node, undefined, context.effects);
      spendEnergy(context, cost.value, "merge");
      resolveNode(context, node, "craft");
      gainEnergy(
        context,
        BALANCE.energy.featureMergeRegen + context.effects.mergeRegenBonus,
        "merge_regen",
      );
      return afterResolution(context);
    }

    case "sprint_merge": {
      const cost = nodeEnergyCost(state, node, undefined, context.effects);
      spendEnergy(context, cost.value, "merge");
      resolveNode(context, node, "craft");
      gainEnergy(
        context,
        BALANCE.energy.sprintMergeRegen + context.effects.mergeRegenBonus,
        "merge_regen",
      );
      return afterResolution(context);
    }

    case "release":
      node.status = "done";
      node.commit = { mode: "craft", reviewed: true };
      return "sprint_end";

    case "sprint_start":
      node.status = "done";
      return afterResolution(context);

    // Listed rather than defaulted: a new `NodeKind` should fail to compile
    // here, not quietly behave like an ordinary commit node.
    case "commit":
    case "fork":
    case "feature":
    case "hotfix":
    case "refactor":
    case "risky":
    case "chore":
      state.phase = { kind: "choose_action" };
      return "continue";
  }
}

function openBranchOf(context: RuleContext, node: MapNode): void {
  const branchId = node.branchId;
  if (branchId === undefined) return;

  const branch = context.state.branches[branchId];
  if (branch === undefined || branch.open || branch.merged) return;

  branch.open = true;
  emit(context, { type: "branch_opened", branchId, kind: branch.kind });
}

/**
 * Works out where the player may go now. Called after anything that resolves a
 * node, including a merge that resolved itself.
 */
export function afterResolution(context: RuleContext): AfterResolution {
  const { state } = context;
  const current = getNode(state, state.player.nodeId);

  if (current.kind === "release") return "sprint_end";

  // A debt explosion interrupts whatever came next: the refactor nodes are
  // spliced in front of the player and become the only way forward.
  if (shouldExplode(context)) {
    injectRefactor(context);
    repayDebt(context, BALANCE.debt.explosionRepay);
  }

  const candidates = successors(state, current.id)
    .filter((node) => node.status !== "done")
    .map((node) => node.id)
    .sort();

  if (candidates.length === 0) {
    // Everything ahead is already resolved — only reachable if an AI burst
    // overshot onto a node the player had already been through.
    state.phase = { kind: "choose_action" };
    return "continue";
  }

  setCandidates(state, candidates);
  state.phase = { kind: "choose_node", candidates };
  emit(context, { type: "candidates", nodeIds: candidates });

  return "continue";
}
