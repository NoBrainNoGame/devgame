import type { Effects } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { repayDebt } from "@/game/core/rules/debt";
import { spendEnergy } from "@/game/core/rules/energy";
import { reviewCleanCount, reviewEnergyCost } from "@/game/core/rules/modifiers";
import type { NodeId, RunState } from "@/game/core/types";

/**
 * Reading back what the machine wrote.
 *
 * A review buys no ground — the rivals move while you read — so it has to pay
 * for itself twice: it repays debt, and because reputation is weighted by how
 * much of your output has been read, it also makes you look better than the
 * bot that shipped twice as much rubbish.
 *
 * Reviewing while the code is fresh pays more. That is what turns the choice
 * into a rhythm (AI, AI, AI, review, merge) instead of a coin flip every node.
 */

export interface ReviewOutcome {
  nodeIds: NodeId[];
  debtDelta: number;
  chain: boolean;
}

export function performReview(context: RuleContext, free: boolean): ReviewOutcome {
  const { state } = context;
  const { review } = BALANCE;

  // The automatic review a DevOps bot performs is the thing the player paid
  // points for; a deliberate one costs what the preview advertised.
  if (!free) {
    spendEnergy(context, reviewEnergyCost(state, context.effects).value, "review");
  }

  const chain = state.player.aiChain >= review.chainLength;
  const budget = reviewCleanCount(state, context.effects);

  // Most recent first: the point of the chain bonus is that fresh code is
  // cheaper to read, so freshness is what gets read.
  const cleaned: NodeId[] = [];
  for (let i = state.player.aiHistory.length - 1; i >= 0 && cleaned.length < budget; i--) {
    const entry = state.player.aiHistory[i];
    if (entry === undefined || entry.reviewed) continue;

    entry.reviewed = true;
    cleaned.push(entry.nodeId);

    const node = state.nodes[entry.nodeId];
    if (node?.commit !== undefined) node.commit.reviewed = true;
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

export function hasUnreviewedAi(context: RuleContext): boolean {
  return hasUnreviewedAiIn(context.state);
}

export function hasUnreviewedAiIn(state: RunState): boolean {
  return state.player.aiHistory.some((entry) => !entry.reviewed);
}

/**
 * Whether the review action is on the table at all.
 *
 * Both halves matter. `canReview` is learned — from the Code review branch, or
 * from Pair programming, which is the same habit under another name. Having
 * something unread is what stops the button being a way to donate a turn to
 * the rivals.
 */
export function canReview(state: RunState, effects: Effects): boolean {
  return effects.canReview && hasUnreviewedAiIn(state);
}

/**
 * The DevOps review bot. Runs on its own cadence at the end of a turn, so the
 * automation the player paid for keeps working while they are busy elsewhere.
 */
export function runFreeReview(context: RuleContext, cadence: number): void {
  if (cadence <= 0) return;

  const { player } = context.state;
  player.turnsSinceFreeReview += 1;
  if (player.turnsSinceFreeReview < cadence) return;

  player.turnsSinceFreeReview = 0;
  if (!hasUnreviewedAi(context)) return;

  performReview(context, true);
}

/** Remembers an AI commit so a later review has something to find. */
export function recordAiCommit(context: RuleContext, nodeId: NodeId): void {
  const { player } = context.state;
  player.aiHistory.push({ nodeId, reviewed: false });
  player.aiChain += 1;

  while (player.aiHistory.length > BALANCE.review.window) player.aiHistory.shift();
}
