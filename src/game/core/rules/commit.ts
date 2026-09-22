import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt } from "@/game/core/rules/debt";
import { spendEnergy } from "@/game/core/rules/energy";
import {
  drawAmbient,
  recordIncident,
  resolveConflict,
  resolveFailure,
} from "@/game/core/rules/events";
import { commitChance, nodeEnergyCost } from "@/game/core/rules/modifiers";
import { currentTicket, getTicket } from "@/game/core/rules/tickets";
import { completeMerge, writeCommit } from "@/game/core/rules/write";
import type { CommitMode, DetourKind, MapNode, NodeKind, Ticket } from "@/game/core/types";

/**
 * The action the whole game is about: write it yourself, or let the machine
 * write it.
 *
 * The odds are shown before the choice is made — see `getActionPreview`. The
 * design originally kept them hidden, but an invisible dice roll teaches the
 * player nothing and reads as unfairness. What stays hidden is the debt, and
 * only partly.
 */

/** What this commit is written as: the forced kind, the detour, or plain. */
export function commitKindFor(ticket: Ticket, kind: DetourKind | undefined): NodeKind {
  return ticket.mustWrite ?? kind ?? "commit";
}

export function performCommit(context: RuleContext, mode: CommitMode, kind?: DetourKind): void {
  const { state } = context;
  const ticket = currentTicket(state);
  if (ticket === null) throw new Error("performCommit: no ticket in hand");

  const nodeKind = commitKindFor(ticket, kind);

  spendEnergy(context, nodeEnergyCost(state, nodeKind, mode).value, "commit");

  const chance = commitChance(state, mode, nodeKind, context.effects);
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

  if (outcome.success) {
    succeed(context, ticket, nodeKind, mode);
    return;
  }

  // A rebase that misses leaves half a replay behind, whatever the failure
  // table then decides to do about it.
  if (nodeKind === "rebase" && !context.effects.absorbRebase) {
    addDebt(context, BALANCE.rebase.failureDebt);
  }

  const failure = resolveFailure(context, nodeKind);

  switch (failure.kind) {
    case "conflict":
      state.phase = {
        kind: "resolve_conflict",
        source: "commit",
        ticketId: ticket.id,
        mode,
        nodeKind,
      };
      emit(context, { type: "conflict", ticketId: ticket.id });
      return;

    case "resolve":
      succeed(context, ticket, nodeKind, mode);
      return;

    case "resolve_then_incident": {
      const node = succeed(context, ticket, nodeKind, mode);
      recordIncident(context, "commit", node.id);
      return;
    }

    case "retry":
      // Nothing was written, and the turn is spent.
      state.phase = { kind: "choose_action" };
      return;
  }
}

function succeed(
  context: RuleContext,
  ticket: Ticket,
  kind: NodeKind,
  mode: CommitMode,
  hiddenBug = false,
): MapNode {
  const { state } = context;
  const node = writeCommit(context, ticket, kind, mode, { hiddenBug });

  // Writing it by hand leaves you knowing where the bodies are.
  if (mode === "craft" && context.rng.chance(BALANCE.commit.craftFreeRefactorPct)) {
    state.player.freeRefactor = true;
  }

  if (context.rng.chance(BALANCE.commit.ambientOnSuccessPct)) drawAmbient(context);

  state.phase = { kind: "choose_action" };
  return node;
}

/**
 * The two ways out of a conflict, and what each leads to. A merge cannot be
 * walked away from — the ticket is half-applied and the only way out is
 * through — so a failed manual fix leaves the question on the table. A rebase
 * that stays tangled is simply not landed, and the turn is gone.
 */
export function resolveConflictPhase(context: RuleContext, how: "manual" | "ai"): void {
  const { state } = context;
  const phase = state.phase;
  if (phase.kind !== "resolve_conflict") throw new Error("resolveConflictPhase: no conflict");

  const ticket = getTicket(state, phase.ticketId);
  const { resolved, hiddenBug } = resolveConflict(context, how);

  if (!resolved) {
    if (phase.source === "commit") state.phase = { kind: "choose_action" };
    return;
  }

  if (phase.source === "merge") completeMerge(context, ticket, { hiddenBug });
  else succeed(context, ticket, phase.nodeKind, phase.mode, hiddenBug);

  state.phase = { kind: "choose_action" };
}
