import type { Effects } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { repayDebt } from "@/game/core/rules/debt";
import { spendEnergy } from "@/game/core/rules/energy";
import { reviewCleanCount, reviewEnergyCost } from "@/game/core/rules/modifiers";
import { currentTicket, unreadAiOn } from "@/game/core/rules/tickets";
import type { NodeId, RunState } from "@/game/core/types";

/**
 * Reading back what the machine wrote.
 *
 * A review buys no ground — the turn goes by while you read — so it has to pay
 * for itself: it repays debt, it is what a ticket that asks to be reviewed
 * needs, and it takes a commit out of the pool the release will roll bugs
 * from.
 *
 * Reviewing while the code is fresh pays more. That is what turns the choice
 * into a rhythm (AI, AI, AI, review, merge) instead of a coin flip every
 * commit.
 */

export interface ReviewOutcome {
  nodeIds: NodeId[];
  debtDelta: number;
  chain: boolean;
}

/**
 * A deliberate review reads the ticket in hand. The automatic one reads the
 * ticket in hand and then whatever has shipped unread — the only way code
 * already on `dev` gets read before the release judges it.
 */
export function performReview(context: RuleContext, free: boolean): ReviewOutcome {
  const { state } = context;
  const { review } = BALANCE;

  // The automatic review is the thing the player paid DevOps points for; a
  // deliberate one costs what the preview advertised.
  if (!free) {
    spendEnergy(context, reviewEnergyCost(state, context.effects).value, "review");
  }

  const chain = state.player.aiChain >= review.chainLength;
  const budget = reviewCleanCount(state, context.effects);

  // Most recent first: the point of the chain bonus is that fresh code is
  // cheaper to read, so freshness is what gets read.
  const candidates = [...reviewable(state, free)].reverse();
  const cleaned: NodeId[] = [];
  for (const id of candidates) {
    if (cleaned.length >= budget) break;
    const node = state.nodes[id];
    if (node === undefined) continue;
    node.commit.reviewed = true;
    cleaned.push(id);
  }
  cleaned.reverse();

  const debtDelta = cleaned.length * review.repayPerCommit;
  if (debtDelta > 0) repayDebt(context, debtDelta);

  // A review breaks the streak whether or not it found anything to read.
  state.player.aiChain = 0;

  emit(context, {
    type: "reviewed",
    nodeIds: cleaned,
    debtDelta: -debtDelta,
    chain,
    free,
  });

  return { nodeIds: cleaned, debtDelta: -debtDelta, chain };
}

function reviewable(state: RunState, includeShipped: boolean): NodeId[] {
  const ticket = currentTicket(state);
  const onTicket = ticket === null ? [] : unreadAiOn(state, ticket);
  if (!includeShipped) return onTicket;

  const shipped = state.shipped.filter((id) => {
    const commit = state.nodes[id]?.commit;
    return commit !== undefined && commit.mode === "ai" && !commit.reviewed;
  });
  return [...shipped, ...onTicket];
}

/** Whether the ticket in hand has machine-written commits nobody has read. */
export function hasUnreviewedAi(state: RunState): boolean {
  const ticket = currentTicket(state);
  return ticket !== null && unreadAiOn(state, ticket).length > 0;
}

/**
 * Whether the review action is on the table at all.
 *
 * Both halves matter. `canReview` is learned — from the Code review ticket, or
 * from Pair programming, which is the same habit under another name. Having
 * something unread is what stops the button being a way to throw a turn
 * away.
 */
export function canReview(state: RunState, effects: Effects): boolean {
  return effects.canReview && hasUnreviewedAi(state);
}

/**
 * The automatic review. Runs on its own cadence at the end of a turn, so the
 * automation the player paid for keeps working while they are busy elsewhere.
 */
export function runFreeReview(context: RuleContext, cadence: number): void {
  if (cadence <= 0) return;

  const { player } = context.state;
  player.turnsSinceFreeReview += 1;
  if (player.turnsSinceFreeReview < cadence) return;

  player.turnsSinceFreeReview = 0;
  if (reviewable(context.state, true).length === 0) return;

  performReview(context, true);
}
