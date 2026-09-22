import type { RunSnapshot } from "@/game/bridge/snapshot";
import { actionKey } from "@/game/core/rules/preview";
import type { PlayerAction } from "@/game/core/types";

/**
 * What the idle timer plays when the supervisor is bought.
 *
 * The idle game's promise is that the run keeps moving while you look away.
 * Without the supervisor it rests; with it, it plays the obvious move: land
 * what is accepted, open the pull request when the ticket is full, read the
 * machine's work when there is enough of it, write by hand while the energy
 * holds, and rest when it does not. Nothing here touches the engine — it is a
 * player pressing buttons, and the action log records it like any other.
 */
export function chooseAutopilot(snapshot: RunSnapshot): PlayerAction | undefined {
  const { actions, previews, player } = snapshot;
  const find = (predicate: (action: PlayerAction) => boolean): PlayerAction | undefined =>
    actions.find(predicate);
  const legal = (action: PlayerAction | undefined): PlayerAction | undefined =>
    action !== undefined && previews[actionKey(action)]?.blocked === undefined ? action : undefined;

  const merge = legal(find((a) => a.type === "merge"));
  if (merge !== undefined) return merge;
  const submit = legal(find((a) => a.type === "submit"));
  if (submit !== undefined) return submit;
  const resume = legal(find((a) => a.type === "resume"));
  if (resume !== undefined) return resume;

  const inHand = snapshot.tickets.find((ticket) => ticket.id === player.ticketId);
  if (inHand !== undefined && inHand.bugs > 0) {
    const fix = legal(find((a) => a.type === "commit" && a.mode === "craft" && a.kind === "fix"));
    if (fix !== undefined) return fix;
  }
  if (inHand !== undefined && inHand.unread >= 2) {
    const review = legal(find((a) => a.type === "review"));
    if (review !== undefined) return review;
  }

  if (inHand === undefined) {
    const start = legal(find((a) => a.type === "start"));
    if (start !== undefined) return start;
  }

  const craft = legal(
    find((a) => a.type === "commit" && a.mode === "craft" && a.kind === undefined),
  );
  if (craft !== undefined) {
    const cost = previews[actionKey(craft)]?.energyCost ?? 0;
    // Keeps a margin above the crunch threshold: an autopilot that burns you
    // out is worse than one that rests.
    if (player.energy - cost > 4) return craft;
  }

  return legal(find((a) => a.type === "rest"));
}
