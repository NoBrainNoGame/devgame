import type { Effects } from "@/game/content";
import { UPGRADES } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { headOf } from "@/game/core/map/graph";
import { capacityAdvice, capacityStatus } from "@/game/core/rules/capacity";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { capacityOf, projectedLoadOf } from "@/game/core/rules/economy";
import { gainEnergy } from "@/game/core/rules/energy";
import { recordIncident } from "@/game/core/rules/events";
import { wipExtra } from "@/game/core/rules/modifiers";
import { gameOver } from "@/game/core/rules/over";
import { lowerQuality } from "@/game/core/rules/quality";
import type { HackKind, RunState } from "@/game/core/types";

/**
 * Hacking the outside world. Not a move in the ordinary sense: it is
 * offered only when the run is in a very tight spot, once a sprint, and it
 * is a coin flip. What it buys is the thing that was missing — patience,
 * energy, a rung of the ladder — and what it costs, on the other side of
 * the coin, is an incident, or the run itself when the patience was
 * already gone. The autopilot never takes it; the choice is yours.
 *
 * The one draw here is the flip, and only when the player tries: a log that
 * never hacks reaches the same game it always did.
 */

export function hackOffer(state: RunState, effects: Effects): HackKind | null {
  if (state.hackSprint === state.sprint) return null;
  const { hack, quality } = BALANCE;

  if (state.quality * 100 >= quality.max * hack.offerAtQualityPct) return "patience";
  if (state.player.energy === 0 && wipExtra(state) >= hack.offerAtWipExtra) return "energy";
  if (capacityStatus(state, effects) === "saturated") {
    const advice = capacityAdvice(state, effects, projectedLoadOf(state) - capacityOf(effects));
    if (advice !== undefined && advice.cost > state.money) return "capacity";
  }
  return null;
}

export function performHack(context: RuleContext): void {
  const { state, effects } = context;
  const kind = hackOffer(state, effects);
  if (kind === null) throw new Error("No hack is offered right now");

  state.hackSprint = state.sprint;
  const { chancePct, patienceRelief } = BALANCE.hack;
  const success = context.rng.chance(chancePct);
  emit(context, { type: "hack", kind, chancePct, success });
  state.stats.hacks.tried += 1;
  if (success) state.stats.hacks.won += 1;

  if (success) {
    switch (kind) {
      case "patience":
        lowerQuality(context, patienceRelief, "hack");
        return;
      case "energy":
        gainEnergy(context, state.player.energyMax - state.player.energy, "hack");
        return;
      case "capacity": {
        const advice = capacityAdvice(state, effects, projectedLoadOf(state) - capacityOf(effects));
        if (advice === undefined) return;
        const level = (state.upgrades[advice.id] ?? 0) + 1;
        state.upgrades[advice.id] = level;
        context.refresh();
        emit(context, { type: "upgrade_bought", id: UPGRADES[advice.id].id, level });
        return;
      }
    }
  }

  if (kind === "patience") gameOver(context, "caught");
  else recordIncident(context, "hack", headOf(state).id);
}
