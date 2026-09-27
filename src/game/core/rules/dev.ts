import {
  TREE,
  TREE_IDS,
  type TreeNodeId,
  UPGRADE_IDS,
  UPGRADES,
  type UpgradeId,
} from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import type { RuleContext } from "@/game/core/rules/context";
import { energyMax, gatherEffects } from "@/game/core/rules/modifiers";
import { gameOver } from "@/game/core/rules/over";
import { qualityMax } from "@/game/core/rules/quality";
import { sprintTurns } from "@/game/core/rules/relics";
import { addDev } from "@/game/core/rules/team";
import { currentTicket } from "@/game/core/rules/tickets";
import { tierOf } from "@/game/core/rules/tier";
import type { DevValues, RunState } from "@/game/core/types";

/**
 * The development build's control panel. It writes values over the run
 * without going through the rules that would have earned them, and says
 * nothing: no event, no log line, no pop — except the run's end, when a
 * full gauge of patience asks for it. What the rules derive from a value
 * follows it — the tier from the earnings, the ceiling of energy from the
 * tree and the shop, a team from a site bought — so the run it leaves is one
 * the rules can carry on from.
 */

/** Every value the panel shows, and how far each may go. */
export interface DevSheet {
  values: Required<Omit<DevValues, "filled" | "upgrades" | "tree">> & {
    /** Null without a ticket in hand. */
    filled: number | null;
    upgrades: Record<UpgradeId, number>;
    tree: Record<TreeNodeId, number>;
  };
  max: {
    tier: number;
    energy: number;
    quality: number;
    debt: number;
    sprintTurn: number;
    filled: number | null;
    /** Null where the shop has no last level. */
    upgrades: Record<UpgradeId, number | null>;
    tree: Record<TreeNodeId, number>;
  };
}

export function devSheet(state: RunState): DevSheet {
  const ticket = currentTicket(state);
  return {
    values: {
      money: state.money,
      earned: state.moneyEarned,
      tier: state.tier,
      energy: state.player.energy,
      skillPoints: state.skillPoints,
      xp: state.xpEarned,
      quality: state.quality,
      debt: state.debt,
      sprint: state.sprint,
      sprintTurn: state.sprintTurn,
      filled: ticket?.filled ?? null,
      upgrades: { ...state.upgrades },
      tree: { ...state.tree },
    },
    max: {
      tier: BALANCE.economy.tier.last,
      energy: energyMax(state),
      quality: qualityMax(gatherEffects(state)),
      debt: BALANCE.debt.max,
      sprintTurn: sprintTurns(state) - 1,
      filled: ticket?.points ?? null,
      upgrades: Object.fromEntries(
        UPGRADE_IDS.map((id) => [id, UPGRADES[id].maxLevel ?? null]),
      ) as Record<UpgradeId, number | null>,
      tree: Object.fromEntries(TREE_IDS.map((id) => [id, TREE[id].maxLevel])) as Record<
        TreeNodeId,
        number
      >,
    },
  };
}

export function applyDevValues(context: RuleContext, values: DevValues): void {
  const { state } = context;
  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, Math.round(value)));

  if (values.money !== undefined) {
    state.money = clamp(values.money, 0, Number.MAX_SAFE_INTEGER);
    if (state.money > state.stats.moneyPeak) state.stats.moneyPeak = state.money;
  }
  if (values.earned !== undefined) {
    state.moneyEarned = clamp(values.earned, 0, Number.MAX_SAFE_INTEGER);
    // Raised silently, like everything here: the tier's narrative is for tiers earned.
    state.tier = Math.max(state.tier, tierOf(state.moneyEarned));
  }
  // After the earnings, so a tier asked for outright wins over the one they imply.
  if (values.tier !== undefined) state.tier = clamp(values.tier, 0, BALANCE.economy.tier.last);
  if (values.skillPoints !== undefined) {
    state.skillPoints = clamp(values.skillPoints, 0, Number.MAX_SAFE_INTEGER);
  }
  if (values.xp !== undefined) state.xpEarned = clamp(values.xp, 0, Number.MAX_SAFE_INTEGER);
  if (values.debt !== undefined) state.debt = clamp(values.debt, 0, BALANCE.debt.max);
  if (values.sprint !== undefined) state.sprint = clamp(values.sprint, 1, Number.MAX_SAFE_INTEGER);
  if (values.sprintTurn !== undefined) {
    state.sprintTurn = clamp(values.sprintTurn, 0, sprintTurns(state) - 1);
  }

  const ticket = currentTicket(state);
  if (values.filled !== undefined && ticket !== null) {
    ticket.filled = clamp(values.filled, 0, ticket.points);
  }

  for (const id of UPGRADE_IDS) {
    const wanted = values.upgrades?.[id];
    if (wanted === undefined) continue;
    const before = state.upgrades[id] ?? 0;
    const level = clamp(wanted, 0, UPGRADES[id].maxLevel ?? Number.MAX_SAFE_INTEGER);
    state.upgrades[id] = level;
    // A site comes staffed, as when it is bought; lowering it lays nobody off.
    const hires = UPGRADES[id].hires;
    if (hires !== undefined) {
      for (let added = before; added < level; added += 1) {
        for (let i = 0; i < hires.count; i += 1) addDev(context, hires.rank, { site: id });
      }
    }
  }
  for (const id of TREE_IDS) {
    const wanted = values.tree?.[id];
    if (wanted !== undefined) state.tree[id] = clamp(wanted, 0, TREE[id].maxLevel);
  }

  // Levels move the ceilings: energy's and patience's are read from the effects.
  context.refresh();
  const ceiling = energyMax(state, context.effects);
  state.player.energyMax = ceiling;
  state.player.energy = clamp(values.energy ?? state.player.energy, 0, ceiling);
  if (state.player.energy > 0) state.player.zeroEnergyStreak = 0;
  if (values.quality !== undefined) {
    const max = qualityMax(context.effects);
    state.quality = clamp(values.quality, 0, max);
    // A full gauge is the sack, however it got full.
    if (state.quality >= max) gameOver(context, "fired", state.stats.lastQualitySource ?? "event");
  }
}
