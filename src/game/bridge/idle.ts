import type { RunSnapshot } from "@/game/bridge/snapshot";
import { chooseSupervisor } from "@/game/bridge/supervisor";
import { actionKey } from "@/game/core/rules/preview";
import type { PlayerAction } from "@/game/core/types";

/**
 * What the idle clock presses when it runs out, in every phase the run can
 * be in: the merge an accepted review is waiting for, the answer to a
 * refusal, the manual fix of a conflict, the first relic on offer — and, in
 * an ordinary turn, the supervisor's move if one is bought, else a start
 * when nothing is in hand, else a rest. Pure over the snapshot, so the bar
 * under a button and the driver that presses it can never disagree.
 */
export function idleTarget(snapshot: RunSnapshot): PlayerAction | undefined {
  const { actions, previews, phase } = snapshot;
  const legal = (action: PlayerAction | undefined): PlayerAction | undefined =>
    action !== undefined && previews[actionKey(action)]?.blocked === undefined ? action : undefined;
  const find = (predicate: (action: PlayerAction) => boolean): PlayerAction | undefined =>
    legal(actions.find(predicate));

  switch (phase.kind) {
    case "pr_accepted":
      return find((a) => a.type === "merge");
    case "ticket_rejected":
      return find((a) => a.type === "resume");
    case "resolve_conflict":
      return find((a) => a.type === "resolve_conflict" && a.how === "manual");
    case "choose_relic":
      return find((a) => a.type === "choose_relic");
    case "game_over":
      return undefined;
    case "choose_action": {
      if (snapshot.autopilot > 0) return legal(chooseSupervisor(snapshot)?.action);
      const inHand = snapshot.tickets.some((ticket) => ticket.id === snapshot.player.ticketId);
      if (!inHand) {
        const start = find((a) => a.type === "start");
        if (start !== undefined) return start;
      }
      return find((a) => a.type === "rest");
    }
  }
}

/** The clock's speeds, and how many of them a run has unlocked. */
export const IDLE_SPEEDS = [1, 10, 100] as const;
export type IdleSpeed = (typeof IDLE_SPEEDS)[number];

export function idleSpeedAllowed(tier: number, speed: IdleSpeed): boolean {
  return IDLE_SPEEDS.indexOf(speed) <= tier;
}
