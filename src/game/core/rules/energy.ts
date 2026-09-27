import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { energyMax, restCostsPatience, restRegen } from "@/game/core/rules/modifiers";
import { raiseQuality } from "@/game/core/rules/quality";

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

/**
 * A turn spent not coding, chosen while work waits. It gives a little energy
 * back, and production notices: a turn off while work waits costs patience.
 * Resting was the only valve when energy was the whole game; with a team
 * landing tickets on every turn you sit out, a free rest was a free turn of
 * their work — which is why the free one is no longer a choice (`passTurn`).
 */
export function performRest(context: RuleContext): void {
  const { state } = context;
  state.sprintCounters.rests += 1;
  state.stats.rests += 1;
  const regen = restRegen(state);
  gainEnergy(context, regen, "rest");
  emit(context, { type: "rested", energy: regen });
  if (restCostsPatience(state)) raiseQuality(context, BALANCE.quality.perRest, "rest");
}

/**
 * A turn that passes on its own: nothing in hand and nothing to start, the
 * team at work. It regenerates like a rest and costs nothing, and it is not
 * counted as one: the player never chose it, so the "no rest" objective and
 * the run's tally of breaks ignore it.
 */
export function passTurn(context: RuleContext): void {
  const regen = restRegen(context.state);
  gainEnergy(context, regen, "rest");
  emit(context, { type: "rested", energy: regen });
}

/** Recomputes the ceiling after a skill or relic changed it, keeping the fill. */

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
