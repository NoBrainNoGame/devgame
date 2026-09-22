import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";

/**
 * Orders of magnitude. The tier is what the shop, the team and the tickets
 * scale with; it is reached by money or by revenue and kept for good, so
 * spending never makes the run smaller. Computed by counting powers, not by
 * a logarithm that rounds 1 000 to 2.999…
 */
export function tierOf(amount: number): number {
  const { first, growth } = BALANCE.economy.tier;
  let tier = 0;
  let threshold = first;
  while (amount >= threshold) {
    tier += 1;
    threshold *= growth;
  }
  return tier;
}

/** Raises the run's tier to `candidate` if that is higher, and says so. */
export function raiseTier(context: RuleContext, candidate: number): void {
  const { state } = context;
  if (candidate <= state.tier) return;
  state.tier = candidate;
  emit(context, { type: "tier_reached", tier: candidate });
}

/** How much a feature arriving now earns and weighs, against a tier-0 one. */
export function tierScale(tier: number, growth: number): number {
  return growth ** tier;
}
