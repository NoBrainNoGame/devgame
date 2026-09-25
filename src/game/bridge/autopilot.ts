import type { RunSnapshot } from "@/game/bridge/snapshot";
import { actionKey } from "@/game/core/rules/preview";
import type { PlayerAction } from "@/game/core/types";

/**
 * Energy kept above the crunch line when writing by hand. Below it, a rest
 * is the move; above it, resting is a turn thrown away.
 */
export const ENERGY_MARGIN = 4;
/** Unread machine commits at which the first supervisor level reads them. */
const REVIEW_AT_UNREAD = 2;

/**
 * The idle clock's hand in an ordinary turn.
 *
 * With no supervisor bought it already moves everything forward, with the
 * crudest sound policy: land what was accepted, carry on after a refusal,
 * fix what the review flagged, open the pull request of a full ticket, start
 * the oldest ticket, write by hand while the energy keeps its margin, rest
 * when it does not. What the supervisor sells is judgement, never autonomy:
 * from its first level it also reads the machine's work before it piles up,
 * and `bridge/supervisor.ts` adds the rest. Nothing here touches the engine —
 * it is a player pressing buttons, and the log records it like any other.
 */
export function chooseAutopilot(
  snapshot: RunSnapshot,
  level = snapshot.autopilot,
): PlayerAction | undefined {
  const { actions, previews, player } = snapshot;
  const legal = (action: PlayerAction | undefined): PlayerAction | undefined =>
    action !== undefined && previews[actionKey(action)]?.blocked === undefined ? action : undefined;
  const find = (predicate: (action: PlayerAction) => boolean): PlayerAction | undefined =>
    legal(actions.find(predicate));
  // Worth writing now: the margin holds, or the bar is full and resting
  // would change nothing.
  const writable = (action: PlayerAction | undefined): PlayerAction | undefined => {
    if (action === undefined) return undefined;
    const cost = previews[actionKey(action)]?.energyCost ?? 0;
    return player.energy - cost > ENERGY_MARGIN || player.energy >= player.energyMax
      ? action
      : undefined;
  };

  const merge = find((a) => a.type === "merge");
  if (merge !== undefined) return merge;
  const submit = find((a) => a.type === "submit");
  if (submit !== undefined) return submit;
  const resume = find((a) => a.type === "resume");
  if (resume !== undefined) return resume;

  const inHand = snapshot.tickets.find((ticket) => ticket.id === player.ticketId);
  // Nothing left to write on it: the way forward is the obstacle holding it.
  if (inHand?.waitingOnObstacle === true) {
    const toObstacle = find((a) => a.type === "checkout" && inHand.blockedBy.includes(a.ticketId));
    if (toObstacle !== undefined) return toObstacle;
  }
  if (inHand !== undefined && inHand.bugs > 0) {
    const fix = find((a) => a.type === "commit" && a.mode === "craft" && a.kind === "fix");
    if (fix !== undefined) return fix;
  }
  if (level >= 1 && inHand !== undefined && inHand.unread >= REVIEW_AT_UNREAD) {
    const review = find((a) => a.type === "review");
    if (review !== undefined) return review;
  }

  if (inHand === undefined) {
    const start = find((a) => a.type === "start");
    if (start !== undefined) return start;
  }

  const craft = writable(
    find((a) => a.type === "commit" && a.mode === "craft" && a.kind === undefined),
  );
  if (craft !== undefined) return craft;
  // A ticket that only takes one kind of commit (a debt ticket's refactor).
  const mustWrite = inHand?.mustWrite;
  if (mustWrite !== undefined) {
    const required = writable(
      find((a) => a.type === "commit" && a.mode === "craft" && a.kind === mustWrite),
    );
    if (required !== undefined) return required;
  }

  const rest = find((a) => a.type === "rest");
  if (rest !== undefined && player.energy < player.energyMax) return rest;
  // Never stall: whatever the rules still allow moves the run forward.
  return (
    find((a) => a.type === "commit" && a.mode === "craft") ??
    find((a) => a.type === "commit") ??
    rest
  );
}
