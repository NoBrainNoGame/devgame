import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { maybeNarrative } from "@/game/core/rules/narrative";
import { systemNote } from "@/game/core/rules/voice";

/**
 * Orders of magnitude. The tier is what the shop, the team and the tickets
 * scale with; it is reached by lifetime earnings and kept for good, so
 * spending never makes the run smaller. Computed by counting powers, not by
 * a logarithm that rounds 1 000 to 2.999…
 */
export function tierOf(amount: number): number {
  const { first, growth, last } = BALANCE.economy.tier;
  let tier = 0;
  let threshold = first;
  while (amount >= threshold && tier < last) {
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
  systemNote(context, "tier");
  maybeNarrative(context, "tier_up");
}

/**
 * The continuous value the look of the run follows: the tier, plus where
 * the lifetime earnings sit between this tier's threshold and the next, on a
 * log scale. Monotonic because the earnings are, so an ambience never goes
 * back — and never a whole number for long, which is the point: the
 * interface is almost always between two of its looks, never switching.
 */
export function austerityOf(moneyEarned: number): number {
  const { first, growth, last } = BALANCE.economy.tier;
  const tier = tierOf(moneyEarned);
  if (tier >= last) return last;
  const floor = tier === 0 ? 1 : first * growth ** (tier - 1);
  const ceiling = tier === 0 ? first : floor * growth;
  const position =
    (Math.log10(Math.max(floor, moneyEarned)) - Math.log10(floor)) /
    (Math.log10(ceiling) - Math.log10(floor));
  return tier + Math.min(1, Math.max(0, position));
}

/** How much a feature arriving now earns and weighs, against a tier-0 one. */
export function tierScale(tier: number, growth: number): number {
  return growth ** tier;
}
