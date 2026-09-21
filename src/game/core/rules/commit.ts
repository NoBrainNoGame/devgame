import { BALANCE } from "@/game/core/balance";
import { getNode } from "@/game/core/map/graph";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt } from "@/game/core/rules/debt";
import { spendEnergy } from "@/game/core/rules/energy";
import { drawAmbient, injectHotfix, resolveFailure } from "@/game/core/rules/events";
import { commitChance, nodeEnergyCost } from "@/game/core/rules/modifiers";
import {
  type AfterResolution,
  afterResolution,
  autoWalk,
  completeMerge,
  isMergeNode,
  replayOntoTrunk,
  resolveNode,
} from "@/game/core/rules/progress";
import type { CommitMode } from "@/game/core/types";

/**
 * The action the whole game is about: write it yourself, or let the machine
 * write it.
 *
 * The odds are shown before the choice is made — see `getActionPreview`. The
 * design originally kept them hidden, but an invisible dice roll teaches the
 * player nothing and reads as unfairness. What stays hidden is the debt, and
 * only partly.
 */

export function performCommit(context: RuleContext, mode: CommitMode): AfterResolution {
  const { state } = context;
  const node = getNode(state, state.player.nodeId);

  const cost = nodeEnergyCost(state, node, mode, context.effects);
  spendEnergy(context, cost.value, "commit");

  const chance = commitChance(state, mode, node, context.effects);
  let outcome = context.rng.roll(chance.value);
  let rerolled = false;

  // Pair programming: a second pair of eyes catches it before it lands. Once
  // per sprint, and only on a failure — it is a safety net, not a bonus.
  if (!outcome.success && context.effects.rerollFailedRoll && !state.player.rerollUsed) {
    state.player.rerollUsed = true;
    rerolled = true;
    outcome = context.rng.roll(chance.value);
  }

  emit(context, {
    type: "roll",
    action: "commit",
    chancePct: chance.value,
    rolled: outcome.rolled,
    success: outcome.success,
    rerolled,
  });

  if (outcome.success) return succeed(context, mode);

  // A rebase that misses leaves half a replay behind, whatever the failure
  // table then decides to do about it.
  if (node.kind === "rebase") addDebt(context, BALANCE.rebase.failureDebt);

  const failure = resolveFailure(context);

  switch (failure.kind) {
    case "conflict":
      state.phase = { kind: "resolve_conflict", nodeId: node.id, mode };
      emit(context, { type: "conflict", nodeId: node.id });
      return "continue";

    case "resolve":
      return succeed(context, mode);

    case "resolve_then_hotfix": {
      resolveNode(context, node, mode);
      injectHotfix(context);
      return afterResolution(context);
    }

    case "retry":
      // The node is still there, still unresolved, and the turn is spent.
      state.phase = { kind: "choose_action" };
      return "continue";
  }
}

function succeed(context: RuleContext, mode: CommitMode): AfterResolution {
  const { state } = context;
  const node = getNode(state, state.player.nodeId);

  const kind = node.kind;
  resolveNode(context, node, mode);

  // The trunk moves under you: the rebase node lands, and the next main-line
  // node lands with it, free.
  if (kind === "rebase") replayOntoTrunk(context);

  if (mode === "ai") {
    const jumps = context.rng.int(BALANCE.commit.aiJump.min, BALANCE.commit.aiJump.max);
    autoWalk(context, jumps + context.effects.aiJumpBonus);
  } else if (context.rng.chance(BALANCE.commit.craftFreeRefactorPct)) {
    // Writing it by hand leaves you knowing where the bodies are.
    state.player.freeRefactor = true;
  }

  if (context.rng.chance(BALANCE.commit.ambientOnSuccessPct)) drawAmbient(context);

  return afterResolution(context);
}

/** Finishes the work that a merge conflict interrupted. */
export function completeConflict(context: RuleContext, mode: CommitMode): AfterResolution {
  const node = getNode(context.state, context.state.player.nodeId);
  // A conflict on a merge is still a merge: it has to cost and pay back what a
  // merge does, not resolve like an ordinary commit.
  if (isMergeNode(node)) return completeMerge(context, node);

  resolveNode(context, node, mode);
  return afterResolution(context);
}
