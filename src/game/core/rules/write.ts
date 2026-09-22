import { BALANCE } from "@/game/core/balance";
import { tipOfLane, tipOfTicket } from "@/game/core/map/graph";
import { DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt, repayDebt } from "@/game/core/rules/debt";
import { gainEnergy, spendEnergy } from "@/game/core/rules/energy";
import { grantSkill } from "@/game/core/rules/grants";
import { nodeEnergyCost } from "@/game/core/rules/modifiers";
import { mostIndebtedOn, settleCurrent } from "@/game/core/rules/tickets";
import type { CommitMode, MapNode, NodeCommit, NodeId, NodeKind, Ticket } from "@/game/core/types";

/**
 * Writing the graph.
 *
 * Nothing exists before it is written: a commit is created at the row after
 * everything else, in its ticket's column, pointing at what it was built on.
 * The trunk is written the same way — a sprint opens with `main` merged back
 * into `dev`, a ticket lands as a merge on `dev`, a sprint ships as a merge on
 * `main` and the release that tags it.
 */

interface NodeSpec {
  kind: NodeKind;
  lane: number;
  parents: NodeId[];
  ticketId?: string;
  skillId?: MapNode["skillId"];
  commit: NodeCommit;
}

function writeNode(context: RuleContext, spec: NodeSpec): MapNode {
  const { state } = context;
  const id: NodeId = `${state.sprint}:${state.nextNodeSerial}`;
  state.nextNodeSerial += 1;

  const node: MapNode = {
    id,
    sprint: state.sprint,
    kind: spec.kind,
    lane: spec.lane,
    depth: state.nextDepth,
    parents: spec.parents,
    ...(spec.ticketId === undefined ? {} : { ticketId: spec.ticketId }),
    ...(spec.skillId === undefined ? {} : { skillId: spec.skillId }),
    commit: spec.commit,
  };
  state.nextDepth += 1;
  state.nodes[id] = node;
  return node;
}

/** Story points a commit of this kind fills, by the hand that wrote it. */
export function pointsFor(ticket: Ticket, mode: CommitMode, kind: NodeKind): number {
  const { points } = BALANCE;
  if (ticket.mustWrite !== undefined) return points.mustWrite;
  // A rebase is housekeeping: it does not move the ticket.
  if (kind === "rebase") return 0;
  return points[mode] + (kind === "risky" ? points.riskyBonus : 0);
}

/**
 * A commit that landed on the ticket in hand, with everything that implies.
 *
 * The first commit forks off `dev`: that is the bifurcation, drawn the moment
 * it exists and not before. Every later one follows the previous.
 */
export function writeCommit(
  context: RuleContext,
  ticket: Ticket,
  kind: NodeKind,
  mode: CommitMode,
  options: { hiddenBug?: boolean } = {},
): MapNode {
  const { state } = context;
  const { debt } = BALANCE;

  const previous = tipOfTicket(state, ticket) ?? tipOfLane(state, DEV_LANE);
  if (previous === undefined || previous === null) {
    throw new Error("writeCommit: nothing on dev to fork from");
  }
  if (ticket.lane === undefined) throw new Error(`writeCommit: ${ticket.id} has no column`);

  const node = writeNode(context, {
    kind,
    lane: ticket.lane,
    parents: [previous.id],
    ticketId: ticket.id,
    commit: {
      mode,
      reviewed: mode === "craft",
      ...(options.hiddenBug === true ? { hiddenBug: true } : {}),
    },
  });
  ticket.nodeIds.push(node.id);
  state.player.totalCommits += 1;
  const debtBefore = state.debt;

  fillPoints(context, ticket, pointsFor(ticket, mode, kind));

  if (mode === "ai") {
    // Documentation pays the debt for you, one machine-written commit at a time.
    if (state.player.docsCharges > 0) {
      state.player.docsCharges -= 1;
      emit(context, { type: "docs_used", nodeId: node.id, remaining: state.player.docsCharges });
    } else {
      addDebt(context, Math.max(0, debt.perAiCommit - context.effects.aiDebtDiscount));
    }
    state.player.aiChain += 1;
  } else {
    state.player.aiChain = 0;
    if (debt.perCraftCommit > 0) addDebt(context, debt.perCraftCommit);
  }

  if (kind === "risky") addDebt(context, debt.perRiskyNode);

  // What this one cost, remembered on the commit: a refactor later takes back
  // exactly that. Measured before anything this commit repays.
  const cost = Math.max(0, state.debt - debtBefore);
  if (cost > 0) node.commit.debt = cost;

  if (kind === "refactor") {
    state.player.freeRefactor = false;
    // The commit that cost the most is the one worth redoing. A forced refactor
    // ticket has no commits of its own to redo, and repays a flat amount.
    const targetId = mostIndebtedOn(state, ticket);
    const target = targetId === null ? undefined : state.nodes[targetId];
    if (targetId !== null && target !== undefined && target.commit.debt !== undefined) {
      const amount = target.commit.debt;
      delete target.commit.debt;
      repayDebt(context, amount);
      emit(context, { type: "debt_refactored", ticketId: ticket.id, nodeId: targetId, amount });
    } else {
      repayDebt(context, debt.refactorRepay);
    }
  }

  if (kind === "fix") {
    // The oldest bug the review flagged is the one this fix redid.
    const fixed = ticket.nodeIds.find((id) => state.nodes[id]?.commit.bugged === true);
    const target = fixed === undefined ? undefined : state.nodes[fixed];
    if (fixed !== undefined && target !== undefined) {
      delete target.commit.bugged;
      emit(context, { type: "bug_fixed", ticketId: ticket.id, nodeId: fixed });
    }
  }

  if (kind === "squash") performSquash(context, ticket);
  if (kind === "docs") writeDocs(context);

  if (kind === "rebase") {
    // The ticket now sits on today's `dev`: whatever landed there since it was
    // opened is no longer a history its merge has to reconcile.
    ticket.devMergesAtOpen = state.devMerges;
    emit(context, { type: "rebased", ticketId: ticket.id });
  }

  // What this commit cost the codebase, which the review will hold against
  // the ticket. Repayments are not credited: a refactor is its own reward.
  ticket.debtAdded += Math.max(0, state.debt - debtBefore);

  emit(context, { type: "node_done", nodeId: node.id, mode, kind });
  return node;
}

/**
 * Throws a ticket's commits away, the way `git reset --hard` does. The rows
 * they took stay empty: history has a hole where the work was, which is
 * exactly what a reset leaves behind.
 */
export function discardCommits(context: RuleContext, ticket: Ticket): NodeId[] {
  const { state } = context;
  const dropped = [...ticket.nodeIds];
  for (const id of dropped) delete state.nodes[id];
  state.player.totalCommits = Math.max(0, state.player.totalCommits - dropped.length);
  ticket.nodeIds = [];
  return dropped;
}

/** Moves the ticket along, never past full. Negative to take points back. */
export function fillPoints(context: RuleContext, ticket: Ticket, delta: number): void {
  const before = ticket.filled;
  ticket.filled = Math.max(0, Math.min(ticket.points, before + delta));

  const applied = ticket.filled - before;
  if (applied === 0) return;

  emit(context, {
    type: "points",
    ticketId: ticket.id,
    delta: applied,
    value: ticket.filled,
    max: ticket.points,
  });
}

/**
 * Squash: the machine's last few commits on this ticket become one, and the
 * mess goes with them.
 *
 * It repays more debt per commit than a review does, needs no skill, and is
 * the only answer to debt a run that never learned to review will find. What
 * it costs is the score: those commits are gone from the history, so they are
 * gone from the count.
 */
function performSquash(context: RuleContext, ticket: Ticket): void {
  const { state } = context;
  const { squash } = BALANCE;

  const unread = ticket.nodeIds.filter((id) => {
    const commit = state.nodes[id]?.commit;
    return commit !== undefined && commit.mode === "ai" && !commit.reviewed;
  });
  const swallowed = unread.slice(-squash.maxCommits);
  if (swallowed.length === 0) return;

  // Squashed commits are neither read nor unread: they no longer exist as
  // separate things, which is also why production can no longer be traced
  // back to them.
  for (const id of swallowed) {
    const node = state.nodes[id];
    if (node !== undefined) node.commit.reviewed = true;
  }
  state.player.aiChain = 0;

  const repaid = swallowed.length * squash.repayPerCommit;
  if (repaid > 0) repayDebt(context, repaid);

  const lost = Math.max(0, swallowed.length - squash.keptCommits);
  state.player.totalCommits = Math.max(0, state.player.totalCommits - lost);

  emit(context, { type: "squashed", nodeIds: swallowed, debtDelta: -repaid, commitsLost: lost });
}

/** Documentation: the next few machine-written commits carry no debt. */
function writeDocs(context: RuleContext): void {
  context.state.player.docsCharges += BALANCE.docs.charges;
  emit(context, { type: "docs_written", charges: context.state.player.docsCharges });
}

/**
 * The ticket lands on `dev`: it costs, it pays back energy, and it hands over
 * what it promised.
 *
 * A merge is the end of a ticket — that is the whole reason `dev` carries
 * nothing else. Its two parents are what the ticket wrote and the `dev` it
 * landed on, the way git records it.
 */
export function completeMerge(
  context: RuleContext,
  ticket: Ticket,
  options: { hiddenBug?: boolean; noRegen?: boolean } = {},
): MapNode {
  const { state } = context;

  spendEnergy(context, nodeEnergyCost(state, "feature_merge", undefined).value, "merge");

  const tip = tipOfTicket(state, ticket);
  const dev = tipOfLane(state, DEV_LANE);
  if (tip === null || dev === null) {
    throw new Error(`completeMerge: ${ticket.id} has nothing to land`);
  }

  const node = writeNode(context, {
    kind: "feature_merge",
    lane: DEV_LANE,
    parents: [tip.id, dev.id],
    ticketId: ticket.id,
    skillId: ticket.skillId,
    commit: {
      mode: "craft",
      reviewed: true,
      ...(options.hiddenBug === true ? { hiddenBug: true } : {}),
    },
  });

  ticket.status = "merged";
  ticket.mergeNodeId = node.id;
  ticket.lane = undefined;

  state.player.totalCommits += 1;
  state.devMerges += 1;
  state.shipped.push(...ticket.nodeIds, node.id);
  state.pointsDelivered += ticket.points;
  state.ticketsDelivered += 1;
  state.xpEarned += BALANCE.xp.perPoint * ticket.points * state.sprint;

  if (ticket.kind === "refactor") repayDebt(context, BALANCE.debt.explosionRepay);

  if (options.noRegen !== true) {
    gainEnergy(
      context,
      BALANCE.energy.featureMergeRegen + context.effects.mergeRegenBonus,
      "merge_regen",
    );
  }

  emit(context, {
    type: "ticket_merged",
    ticketId: ticket.id,
    nodeId: node.id,
    ...(ticket.skillId === undefined ? {} : { skillId: ticket.skillId }),
  });
  if (ticket.skillId !== undefined) grantSkill(context, ticket.skillId);

  emit(context, { type: "node_done", nodeId: node.id, mode: "craft", kind: "feature_merge" });

  settleCurrent(context);
  return node;
}

/** `main` merged back into `dev`: the anchor a sprint opens on. */
export function writeSprintStart(context: RuleContext): MapNode {
  const main = tipOfLane(context.state, MAIN_LANE);
  const node = writeNode(context, {
    kind: "sprint_start",
    lane: DEV_LANE,
    parents: main === null ? [] : [main.id],
    commit: { mode: "craft", reviewed: true },
  });
  emit(context, { type: "node_done", nodeId: node.id, mode: "craft", kind: "sprint_start" });
  return node;
}

/**
 * The sprint ships: `dev` merged into `main`, and the release that tags it.
 * Plumbing rather than a decision, so both are written by the sprint closing.
 */
export function writeRelease(context: RuleContext): { merge: MapNode; release: MapNode } {
  const { state } = context;
  const dev = tipOfLane(state, DEV_LANE);
  const main = tipOfLane(state, MAIN_LANE);
  if (dev === null) throw new Error("writeRelease: nothing on dev to ship");

  const merge = writeNode(context, {
    kind: "sprint_merge",
    lane: MAIN_LANE,
    parents: main === null ? [dev.id] : [main.id, dev.id],
    commit: { mode: "craft", reviewed: true },
  });
  spendEnergy(context, nodeEnergyCost(state, "sprint_merge", undefined).value, "merge");
  state.player.totalCommits += 1;
  emit(context, { type: "node_done", nodeId: merge.id, mode: "craft", kind: "sprint_merge" });

  const release = writeNode(context, {
    kind: "release",
    lane: MAIN_LANE,
    parents: [merge.id],
    commit: { mode: "craft", reviewed: true },
  });
  state.player.totalCommits += 1;
  emit(context, { type: "node_done", nodeId: release.id, mode: "craft", kind: "release" });

  gainEnergy(
    context,
    BALANCE.energy.sprintMergeRegen + context.effects.mergeRegenBonus,
    "merge_regen",
  );

  return { merge, release };
}
