import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { energyMax, restRegen } from "@/game/core/rules/modifiers";

/**
 * Energy is the run's clock. Every commit spends it, merges and weekends give
 * it back, and running out is how a run ends.
 *
 * The original design ended the run the instant it hit zero. That is a
 * surprise, not a decision, so instead zero is survivable for one turn and the
 * approach to it is signposted: below the crunch threshold every roll gets
 * visibly worse.
 */

export function spendEnergy(context: RuleContext, amount: number, reason: string): void {
  if (amount === 0) return;
  changeEnergy(context, -amount, reason);
}

export function gainEnergy(context: RuleContext, amount: number, reason: string): void {
  if (amount === 0) return;
  changeEnergy(context, amount, reason);
}

function changeEnergy(context: RuleContext, delta: number, reason: string): void {
  const { player } = context.state;
  const max = energyMax(context.state, context.effects);
  const before = player.energy;

  player.energy = Math.max(0, Math.min(max, before + delta));
  player.energyMax = max;

  const applied = player.energy - before;
  if (applied === 0) return;

  emit(context, { type: "energy", delta: applied, value: player.energy, reason });
}

/** Recomputes the ceiling after a skill or relic changed it, keeping the fill. */
/** A turn spent not coding. */
export function performRest(context: RuleContext): void {
  const regen = restRegen(context.state);
  gainEnergy(context, regen, "rest");
  emit(context, { type: "rested", energy: regen });
}

export function syncEnergyMax(context: RuleContext): void {
  const { player } = context.state;
  const max = energyMax(context.state, context.effects);
  if (max === player.energyMax) return;

  const gained = max - player.energyMax;
  player.energyMax = max;
  if (gained > 0) gainEnergy(context, gained, "max_raised");
  else player.energy = Math.min(player.energy, max);
}

/**
 * Called at the end of every turn that consumed one. Returns true when the run
 * has ended in burnout.
 */
export function checkBurnout(context: RuleContext): boolean {
  const { player } = context.state;

  if (player.energy > 0) {
    player.zeroEnergyStreak = 0;
    return false;
  }

  player.zeroEnergyStreak += 1;
  return player.zeroEnergyStreak >= BALANCE.energy.burnoutStreak;
}

/** Emits a crunch event when the state changed, so the HUD can react once. */
export function reportCrunch(context: RuleContext, wasCrunch: boolean): void {
  const now = context.state.player.energy <= BALANCE.energy.crunchThreshold;
  if (now !== wasCrunch) emit(context, { type: "crunch", active: now });
}
