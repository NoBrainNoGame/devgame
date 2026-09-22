import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { forceTicket, openTickets } from "@/game/core/rules/tickets";

/**
 * Technical debt: the price of every shortcut, paid later and all at once.
 *
 * It does two things. It makes every roll worse in proportion to itself, and
 * past a threshold it forces a refactor ticket open. The player is never told
 * the exact figure unless something in the build reveals it — see `debtView`
 * in `modifiers.ts` for what is shown instead.
 */

export function addDebt(context: RuleContext, amount: number): void {
  if (amount === 0) return;

  const { state } = context;
  const before = state.debt;
  state.debt = Math.max(0, Math.min(BALANCE.debt.max, before + amount));

  const applied = state.debt - before;
  if (applied === 0) return;

  // The noise is redrawn only when the value moves, so a player staring at the
  // gauge between two actions sees a stable band rather than a flickering one.
  state.debtNoise = context.rng.int(-BALANCE.debt.noiseSpread, BALANCE.debt.noiseSpread);

  emit(context, { type: "debt", delta: applied, value: state.debt });
}

export function repayDebt(context: RuleContext, amount: number): void {
  addDebt(context, -Math.abs(amount));
}

/** End-of-turn automatic repayment from a linter. */
export function applyDebtDecay(context: RuleContext): void {
  const decay = context.effects.debtDecayPerTurn;
  if (decay > 0) repayDebt(context, decay);
}

/**
 * Past the threshold, a refactor ticket is forced open — one at a time. The
 * debt stays high until that ticket merges, so without the guard a second
 * one would open every turn.
 */
export function checkExplosion(context: RuleContext): void {
  const { state } = context;
  if (state.debt < BALANCE.debt.explosionThreshold) return;
  if (openTickets(state).some((ticket) => ticket.kind === "refactor")) return;

  const ticket = forceTicket(context, "refactor", BALANCE.debt.explosionPoints);
  emit(context, { type: "debt_explosion", ticketId: ticket.id });
}
