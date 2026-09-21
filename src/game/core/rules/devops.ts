import { DEVOPS, type DevopsId, devopsCost } from "@/game/content";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { syncEnergyMax } from "@/game/core/rules/energy";

/**
 * Placing a DevOps point is the only move that does not hand the rivals a turn.
 * It is free in time and expensive in tempo: the points come from surviving
 * sprints and gaining levels, so spending one is always something you did
 * instead of something else.
 */

export function canPlaceDevops(
  state: { devops: Record<DevopsId, number>; devopsPoints: number },
  id: DevopsId,
): boolean {
  const level = state.devops[id] ?? 0;
  const cost = devopsCost(id, level);
  return cost !== undefined && cost <= state.devopsPoints;
}

export function placeDevops(context: RuleContext, id: DevopsId): void {
  const { state } = context;
  const level = state.devops[id] ?? 0;
  const cost = devopsCost(id, level);

  if (cost === undefined) throw new Error(`${id} is already at level ${DEVOPS[id].maxLevel}`);
  if (cost > state.devopsPoints)
    throw new Error(`${id} costs ${cost}, you have ${state.devopsPoints}`);

  state.devopsPoints -= cost;
  state.devops[id] = level + 1;

  context.refresh();
  syncEnergyMax(context);

  emit(context, { type: "devops_placed", id, level: level + 1 });
  emit(context, { type: "devops_points", delta: -cost, value: state.devopsPoints });
}
