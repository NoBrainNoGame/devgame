import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { spendEnergy } from "@/game/core/rules/energy";
import { drawAmbient, resolveConflict } from "@/game/core/rules/events";
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

/** What this commit is written as: a fix, the forced kind, the detour, or plain. */
export function commitKindFor(ticket: Ticket, kind: DetourKind | undefined): NodeKind {
  if (kind === "fix") return "fix";
  return ticket.mustWrite ?? kind ?? "commit";
}

export function performCommit(context: RuleContext, mode: CommitMode, kind?: DetourKind): void {
  const { state } = context;
  const ticket = currentTicket(state);
  if (ticket === null) throw new Error("performCommit: no ticket in hand");

  const nodeKind = commitKindFor(ticket, kind);

  spendEnergy(context, nodeEnergyCost(state, nodeKind, mode).value, "commit");

  // A showcase's commits always land: the run is looked at, not played.
  const measured = commitChance(state, mode, nodeKind, context.effects);
  const chance = state.showcase !== null ? { ...measured, value: 100 } : measured;
  const outcome = context.rng.roll(chance.value);

  emit(context, {
    type: "roll",
    action: "commit",
    chancePct: chance.value,
    rolled: outcome.rolled,
    success: outcome.success,
  });

  // The commit is written either way: a roll that misses leaves a broken
  // commit on the branch — bugged, worth nothing, local until a fix redoes
  // it — not a turn that vanished.
  writeAndSettle(context, ticket, nodeKind, mode, { broken: !outcome.success });
}

function writeAndSettle(
  context: RuleContext,
  ticket: Ticket,
  kind: NodeKind,
  mode: CommitMode,
  options: { hiddenBug?: boolean; broken?: boolean },
): MapNode {
  const { state } = context;
  const node = writeCommit(context, ticket, kind, mode, options);

  if (options.broken !== true) {
    // Writing it by hand leaves you knowing where the bodies are.
    if (mode === "craft" && context.rng.chance(BALANCE.commit.craftFreeRefactorPct)) {
      state.player.freeRefactor = true;
    }
    if (context.rng.chance(BALANCE.commit.ambientOnSuccessPct)) drawAmbient(context);
  }

  state.phase = { kind: "choose_action" };
  return node;
}

/**
 * The two ways out of a merge conflict. A merge cannot be walked away from —
 * the ticket is half-applied and the only way out is through — so a failed
 * manual fix leaves the question on the table.
 */
export function resolveConflictPhase(context: RuleContext, how: "manual" | "ai"): void {
  const { state } = context;
  const phase = state.phase;
  if (phase.kind !== "resolve_conflict") throw new Error("resolveConflictPhase: no conflict");

  const ticket = getTicket(state, phase.ticketId);
  const { resolved, hiddenBug } = resolveConflict(context, how);

  if (!resolved) return;

  completeMerge(context, ticket, { hiddenBug });
  state.phase = { kind: "choose_action" };
}
