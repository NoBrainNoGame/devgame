import type { RunSnapshot } from "@/game/bridge/snapshot";
import { chooseSupervisor } from "@/game/bridge/supervisor";
import { actionKey } from "@/game/core/rules/preview";
import type { PlayerAction } from "@/game/core/types";

/**
 * What the idle clock presses when it runs out, in every phase the run can
 * be in: the merge an accepted review is waiting for, the answer to a
 * refusal, the manual fix of a conflict, the first bonus on offer, the first
 * answer to a question — and, in an ordinary turn, the move of the
 * supervisor at the level bought, level 0 included: turned on, the clock
 * always has something to press. Pure over the snapshot, so the bar under a
 * button and the driver that presses it can never disagree.
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
    case "event":
      return find((a) => a.type === "answer");
    case "game_over":
      return undefined;
    case "choose_action":
      return legal(chooseSupervisor(snapshot)?.action) ?? find((a) => a.type === "rest");
  }
}

/** The clock's speeds, and how many of them a run has unlocked. */
export const IDLE_SPEEDS = [1, 10, 100] as const;
export type IdleSpeed = (typeof IDLE_SPEEDS)[number];

export function idleSpeedAllowed(tier: number, speed: IdleSpeed): boolean {
  return IDLE_SPEEDS.indexOf(speed) <= tier;
}
