import { BALANCE } from "@/game/core/balance";
import { devLineIndexOf, getNode, setCandidates, successors } from "@/game/core/map/graph";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt, repayDebt, shouldExplode } from "@/game/core/rules/debt";
import { gainEnergy, spendEnergy } from "@/game/core/rules/energy";
import { drawAmbient, injectRefactor } from "@/game/core/rules/events";
import { grantSkill } from "@/game/core/rules/grants";
import { mergeConflictChance, nodeEnergyCost } from "@/game/core/rules/modifiers";
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
  // `HEAD` only ever moves onto a commit that now exists.
  state.player.headId = node.id;
  state.player.totalCommits += 1;
  advanceRacePosition(context, node);

  if (mode === "ai") {
    // Documentation pays the debt for you, one machine-written node at a time.
    if (state.player.docsCharges > 0) {
      state.player.docsCharges -= 1;
      emit(context, {
        type: "docs_used",
        nodeId: node.id,
        remaining: state.player.docsCharges,
      });
    } else {
      addDebt(context, options.primary ? debt.perAiCommit : debt.perAiJumpNode);
    }
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
  if (node.kind === "squash") performSquash(context);
  if (node.kind === "docs") writeDocs(context);

  closeBranchesInto(context, node);

  emit(context, { type: "node_done", nodeId: node.id, mode, kind: node.kind });
}

/**
 * Moves the player up the main line, if this node was further up it.
 *
 * Monotonic on purpose. A rejected pull request docks `sprintProgress`, and if
 * the next node simply recomputed the position from the graph that penalty
 * would vanish the moment you moved — so the furthest index reached is tracked
 * separately and only the *gain* is added.
 */
function advanceRacePosition(context: RuleContext, node: MapNode): void {
  const { player } = context.state;
  const reached = devLineIndexOf(context.state, node);
  if (reached <= player.mainReached) return;

  player.sprintProgress += reached - player.mainReached;
  player.mainReached = reached;
}

/**
 * Squash: the machine's last few commits become one, and the mess goes with
 * them.
 *
 * It repays more debt per commit than a review does, needs no skill, and is
 * the only answer to debt a run that never learned to review will find. What
 * it costs is the score: those commits are gone from the history, so they are
 * gone from the count.
 */
function performSquash(context: RuleContext): void {
  const { state } = context;
  const { squash } = BALANCE;

  const swallowed = state.player.aiHistory.slice(-squash.maxCommits);
  if (swallowed.length === 0) return;

  state.player.aiHistory = state.player.aiHistory.slice(0, -swallowed.length);
  state.player.aiChain = 0;

  // They do not become reviewed, they cease to exist — which is also why a
  // production bug can no longer be traced back to them.
  const unread = swallowed.filter((entry) => !entry.reviewed);
  const repaid = unread.length * squash.repayPerCommit;
  if (repaid > 0) repayDebt(context, repaid);

  const lost = Math.max(0, swallowed.length - squash.keptCommits);
  state.player.totalCommits = Math.max(0, state.player.totalCommits - lost);

  emit(context, {
    type: "squashed",
    nodeIds: swallowed.map((entry) => entry.nodeId),
    debtDelta: -repaid,
    commitsLost: lost,
  });
}

/** Documentation: the next few machine-written commits carry no debt. */
function writeDocs(context: RuleContext): void {
  context.state.player.docsCharges += BALANCE.docs.charges;
  emit(context, { type: "docs_written", charges: context.state.player.docsCharges });
}

/**
 * Closes every open branch that merges into this node, and hands over what it
 * promised.
 *
 * A merge is the end of a feature — that is the whole reason `main` carries
 * nothing else. So a branch is not closed by walking its last commit; it is
 * closed by the merge commit the branch lands in, which for a feature is a node
 * on `main` and for a branch off a branch is its parent's last commit.
 *
 * Only branches that were actually opened are merged. The other options at the
 * same merge were never written, so they are not delivered either.
 */
function closeBranchesInto(context: RuleContext, node: MapNode): void {
  const { state } = context;

  for (const branchId of Object.keys(state.branches).sort()) {
    const branch = state.branches[branchId];
    if (branch === undefined || branch.merged || !branch.open) continue;
    if (branch.mergeInto !== node.id) continue;

    branch.merged = true;
    branch.open = false;

    emit(context, {
      type: "branch_merged",
      branchId,
      ...(branch.skillId === undefined ? {} : { skillId: branch.skillId }),
    });

    if (branch.skillId !== undefined) grantSkill(context, branch.skillId);
  }
}

/**
 * A successful AI commit keeps going on its own. It stops at anything that is
 * a decision or a milestone — the machine writes the boring parts, not the
 * ones you would want a say in.
 */
export function autoWalk(context: RuleContext, jumps: number): NodeId[] {
  return walkAhead(context, jumps, "ai");
}

/**
 * Walks forward without a roll, in the given hand.
 *
 * A rebase replays work that already exists, so it walks as `craft`: the nodes
 * it carries are yours, already written, and they add no debt of their own.
 */
function walkAhead(context: RuleContext, jumps: number, mode: CommitMode): NodeId[] {
  const walked: NodeId[] = [];

  for (let i = 0; i < jumps; i++) {
    const current = getNode(context.state, context.state.player.nodeId);
    const nexts = successors(context.state, current.id);

    if (nexts.length !== 1) break;
    const next = nexts[0];
    if (next === undefined || next.status === "done") break;
    if (!isAutoWalkable(next)) break;

    resolveNode(context, next, mode, { primary: false });
    walked.push(next.id);
  }

  if (walked.length > 0 && mode === "ai") emit(context, { type: "ai_jumped", nodeIds: walked });
  return walked;
}

/**
 * Rebase: the trunk moves under you and your work lands on top of it.
 *
 * The node it carries costs no roll and no energy, which is the whole appeal —
 * it is the only way in the game to gain ground on the rivals faster than one
 * node per turn without letting the machine write anything.
 */
export function replayOntoTrunk(context: RuleContext): NodeId[] {
  const walked = walkAhead(context, BALANCE.rebase.carry, "craft");
  if (walked.length > 0) emit(context, { type: "rebased", nodeIds: walked });
  return walked;
}

function isAutoWalkable(node: MapNode): boolean {
  return node.kind === "commit" || node.kind === "feature" || node.kind === "hotfix";
}

/**
 * Steps onto `nodeId`. Merges, releases and sprint anchors resolve on arrival;
 * everything else waits for the player to decide how to write it.
 */
export function arriveAt(context: RuleContext, nodeId: NodeId, depth = 0): AfterResolution {
  const { state } = context;
  const from = state.player.nodeId;
  const node = getNode(state, nodeId);

  state.player.nodeId = nodeId;
  node.status = "current";
  emit(context, { type: "player_moved", from, to: nodeId });

  openBranchOf(context, node);

  switch (node.kind) {
    case "feature_merge":
    case "sprint_merge":
      return beginMerge(context, node, depth);

    // Both are written by arriving at them: the release tags what `dev` just
    // shipped, and the anchor is `main` merged back into `dev` to open the
    // sprint. `HEAD` follows, because both are real commits.
    case "release":
      node.status = "done";
      node.commit = { mode: "craft", reviewed: true };
      state.player.headId = node.id;
      return "sprint_end";

    case "sprint_start":
      node.status = "done";
      node.commit = { mode: "craft", reviewed: true };
      state.player.headId = node.id;
      return afterResolution(context, depth);

    // Listed rather than defaulted: a new `NodeKind` should fail to compile
    // here, not quietly behave like an ordinary commit node.
    case "commit":
    case "fork":
    case "feature":
    case "hotfix":
    case "refactor":
    case "risky":
    case "chore":
    case "squash":
    case "docs":
    case "rebase":
      state.phase = { kind: "choose_action" };
      return "continue";
  }
}

/**
 * Landing a branch on the thing it came from.
 *
 * This is the only place a merge conflict can start, because it is the only
 * place two histories meet — that and a rebase, which is the same act under
 * another name. A conflict here does not cost you the merge; it costs you the
 * decision of how to untangle it, and the merge finishes either way.
 */
function beginMerge(context: RuleContext, node: MapNode, depth: number): AfterResolution {
  if (context.rng.chance(mergeConflictChance(context.state))) {
    context.state.phase = { kind: "resolve_conflict", nodeId: node.id, mode: "craft" };
    emit(context, { type: "conflict", nodeId: node.id });
    return "continue";
  }

  return completeMerge(context, node, depth);
}

/** The merge itself: it costs, it lands, and it hands energy back. */
export function completeMerge(context: RuleContext, node: MapNode, depth = 0): AfterResolution {
  const { state } = context;

  const cost = nodeEnergyCost(state, node, undefined, context.effects);
  spendEnergy(context, cost.value, "merge");
  resolveNode(context, node, "craft");

  const regen =
    node.kind === "sprint_merge"
      ? BALANCE.energy.sprintMergeRegen
      : BALANCE.energy.featureMergeRegen;
  gainEnergy(context, regen + context.effects.mergeRegenBonus, "merge_regen");

  return afterResolution(context, depth);
}

export function isMergeNode(node: MapNode): boolean {
  return node.kind === "feature_merge" || node.kind === "sprint_merge";
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
export function afterResolution(context: RuleContext, depth = 0): AfterResolution {
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

  // One way forward is not a choice. Asking the player to click it taught them
  // nothing and read as a list of one — so the graph walks it for them. When
  // there *are* several, they are features to open, never another commit.
  const only = candidates[0];
  if (candidates.length === 1 && only !== undefined && depth < AUTO_ADVANCE_LIMIT) {
    return arriveAt(context, only, depth + 1);
  }

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

/**
 * How many forced steps may be walked in one go.
 *
 * A merge leads to the next decision, which can itself be forced, so the walk
 * recurses. The bound is a guard against a malformed graph, not a rule: a real
 * sprint never chains more than a handful.
 */
const AUTO_ADVANCE_LIMIT = 32;
