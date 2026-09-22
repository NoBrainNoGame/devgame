import type { Effects } from "@/game/content";
import {
  UPGRADE_IDS,
  UPGRADES,
  type UpgradeId,
  upgradeCost,
  upgradeUnlocked,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { capacityOf, projectedLoadOf } from "@/game/core/rules/economy";
import type { RunState } from "@/game/core/types";

/**
 * What to buy when production is about to saturate. The advice a warning
 * carries, and what a supervisor of the third level acts on: the cheapest
 * rung whose next level covers the shortfall, or, when no single level
 * does, the rung that gives the most users per euro. The player is never
 * told to buy ten servers when a datacenter is for sale.
 */

export interface CapacityAdvice {
  id: UpgradeId;
  cost: number;
  /** Users the next level of that rung serves. */
  users: number;
}

/** Users short of the projected load, zero when served. */
export function capacityShortfall(state: RunState, effects: Effects): number {
  return Math.max(0, projectedLoadOf(state) - capacityOf(effects));
}

/** Users the next level of a rung would serve, on top of what is owned. */
function usersOf(id: UpgradeId, effects: Effects): number {
  const per = UPGRADES[id].perLevel;
  const base = BALANCE.economy.infra.baseCapacity + effects.infraCapacity;
  const flat = ((per.infraCapacity ?? 0) * (100 + effects.infraCapacityPct)) / 100;
  const pct = (base * (per.infraCapacityPct ?? 0)) / 100;
  return Math.floor(flat + pct);
}

export function capacityAdvice(
  state: RunState,
  effects: Effects,
  needed: number,
): CapacityAdvice | undefined {
  const rungs: CapacityAdvice[] = [];
  for (const id of UPGRADE_IDS) {
    if (UPGRADES[id].category !== "infra" || !upgradeUnlocked(id, state.tier)) continue;
    const cost = upgradeCost(id, state.upgrades[id] ?? 0);
    const users = usersOf(id, effects);
    if (cost === undefined || users <= 0) continue;
    rungs.push({ id, cost, users });
  }
  if (rungs.length === 0) return undefined;

  const covering = rungs.filter((rung) => rung.users >= needed).sort((a, b) => a.cost - b.cost);
  if (covering[0] !== undefined) return covering[0];
  return rungs.sort((a, b) => b.users / b.cost - a.users / a.cost)[0];
}
