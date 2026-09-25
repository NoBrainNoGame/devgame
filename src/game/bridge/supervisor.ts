import { chooseAutopilot } from "@/game/bridge/autopilot";
import type { RunSnapshot } from "@/game/bridge/snapshot";
import { DEV_RANK, DEV_RANKS } from "@/game/content";
import { actionKey } from "@/game/core/rules/preview";
import type { PlayerAction } from "@/game/core/types";

/**
 * The supervisor's levels buy judgement, not autonomy: level 0, bought or
 * not, already moves everything (`chooseAutopilot`). The first reads the
 * machine's work before it piles up. The second also keeps the code in
 * shape — checks out a hotfix that is waiting, refactors when production or
 * the debt say so, squashes and reads the machine's work sooner. The third
 * also spends: the rung the game advises, the best rank the payroll can
 * carry, a skill point when the money is plentiful. Every move comes with the
 * reason the HUD prints under the panel. Nothing here touches the engine, and
 * the hack is never taken: that choice stays yours.
 */

export const SUPERVISOR_REASONS = [
  "merge",
  "submit",
  "resume",
  "fix",
  "review",
  "start",
  "craft",
  "rest",
  "hotfix",
  "refactor",
  "squash",
  "buy",
  "hire",
  "point",
] as const;

export type SupervisorReason = (typeof SUPERVISOR_REASONS)[number];

export interface SupervisorMove {
  action: PlayerAction;
  reason: SupervisorReason;
}

/** Quality share and debt floor at which the second level refactors. */
const REFACTOR_AT_QUALITY_PCT = 50;
const REFACTOR_AT_DEBT = 40;
/** Unread machine commits at which the second level squashes, then reviews. */
const SQUASH_AT_UNREAD = 3;
const REVIEW_AT_UNREAD = 1;
/** Months of bills the third level keeps in hand before hiring. */
const HIRE_RESERVE_MONTHS = 2;
/** Times the skill point's price the third level wants in hand before buying one. */
const POINT_AT_MONEY_FACTOR = 3;

function reasonOf(action: PlayerAction): SupervisorReason {
  switch (action.type) {
    case "merge":
    case "submit":
    case "resume":
    case "review":
    case "start":
    case "rest":
      return action.type;
    case "commit":
      return action.kind === "fix" ? "fix" : "craft";
    default:
      return "craft";
  }
}

export function chooseSupervisor(snapshot: RunSnapshot): SupervisorMove | undefined {
  const { actions, previews, player, economy } = snapshot;
  const level = snapshot.autopilot;
  const legal = (action: PlayerAction | undefined): PlayerAction | undefined =>
    action !== undefined && previews[actionKey(action)]?.blocked === undefined ? action : undefined;
  const find = (predicate: (action: PlayerAction) => boolean): PlayerAction | undefined =>
    legal(actions.find(predicate));

  const base = chooseAutopilot(snapshot);
  if (base === undefined) return undefined;
  // What is accepted lands, what is full goes up, what was refused carries
  // on: at every level, before anything else.
  if (base.type === "merge" || base.type === "submit" || base.type === "resume") {
    return { action: base, reason: reasonOf(base) };
  }

  if (level >= 3) {
    const advised = economy.advice;
    if (advised !== null) {
      const buy = find((a) => a.type === "buy" && a.id === advised.id);
      if (buy !== undefined) return { action: buy, reason: "buy" };
    }
    const reserve = HIRE_RESERVE_MONTHS * (economy.upkeep + economy.salaries);
    for (const rank of [...DEV_RANKS].reverse()) {
      const hire = find((a) => a.type === "hire" && a.rank === rank);
      if (
        hire !== undefined &&
        economy.net - DEV_RANK[rank].salary >= 0 &&
        economy.money - economy.hireCosts[rank] >= reserve
      ) {
        return { action: hire, reason: "hire" };
      }
    }
    if (economy.money >= POINT_AT_MONEY_FACTOR * economy.skillPointPrice) {
      const point = find((a) => a.type === "buy_point");
      if (point !== undefined) return { action: point, reason: "point" };
    }
  }

  if (level >= 2) {
    const inHand = snapshot.tickets.find((ticket) => ticket.id === player.ticketId);
    const hotfix = snapshot.tickets.find(
      (ticket) =>
        ticket.kind === "hotfix" &&
        ticket.status === "open" &&
        ticket.assignee === undefined &&
        ticket.id !== player.ticketId,
    );
    if (hotfix !== undefined) {
      const checkout = find((a) => a.type === "checkout" && a.ticketId === hotfix.id);
      if (checkout !== undefined) return { action: checkout, reason: "hotfix" };
    }
    if (inHand !== undefined && inHand.mustWrite === undefined) {
      const strained =
        snapshot.quality * 100 >= snapshot.qualityMax * REFACTOR_AT_QUALITY_PCT ||
        snapshot.debt.range[0] >= REFACTOR_AT_DEBT;
      if (strained) {
        const refactor = find(
          (a) => a.type === "commit" && a.mode === "craft" && a.kind === "refactor",
        );
        if (refactor !== undefined) return { action: refactor, reason: "refactor" };
      }
      if (inHand.unread >= SQUASH_AT_UNREAD) {
        const squash = find(
          (a) => a.type === "commit" && a.mode === "craft" && a.kind === "squash",
        );
        if (squash !== undefined) return { action: squash, reason: "squash" };
      }
      if (inHand.unread >= REVIEW_AT_UNREAD) {
        const review = find((a) => a.type === "review");
        if (review !== undefined) return { action: review, reason: "review" };
      }
    }
  }

  return { action: base, reason: reasonOf(base) };
}
