import type { SessionOptions } from "@/game/bridge/session";
import type { RunSnapshot } from "@/game/bridge/snapshot";
import { chooseSupervisor } from "@/game/bridge/supervisor";
import { RELICS, UPGRADES } from "@/game/content";
import { actionKey } from "@/game/core/rules/preview";
import type { PlayerAction } from "@/game/core/types";
import { emptyMeta } from "@/game/dto/meta";

/**
 * The run the landing page shows.
 *
 * It is not a drawing of a run: it is one, played by the game's own
 * supervisor against the game's own engine and drawn by the game's own scene,
 * so it stays true to how the game writes a graph whatever the rules become.
 * It plays today's seed — the same map the daily board plays, so everyone
 * sees the same run on a given day — as a showcase: two juniors on the
 * roster from turn 1, a board fed so they never stand idle, and no way to
 * lose. The page is a window, not a challenge; a graph that stops dead in a
 * game over would show nothing, and it never stops on its own: the history
 * scrolls off the bottom for as long as the page is open.
 *
 * The policy is deterministic for a seed, so `tests/demo.test.ts` can play
 * it headless on a fixed list of seeds and measure that it goes somewhere.
 */

export const DEMO_SESSION: Omit<SessionOptions, "resumeActions" | "seed"> = {
  mode: "daily",
  profileId: "junior",
  meta: emptyMeta("2026-01-01T00:00:00.000Z"),
  clientRunId: "00000000-0000-4000-8000-000000000000",
  createdAt: "2026-01-01T00:00:00.000Z",
  showcase: { team: ["junior", "junior"], backlog: 8 },
};

/** The team on the graph: the showcase's, the whole run long. */
export const DEMO_TEAM = DEMO_SESSION.showcase?.team.length ?? 0;

/**
 * The supervisor level the demo plays at: the one that spends, so the
 * servers keep up and the machine's work gets read before a review does.
 */
const SUPERVISOR_LEVEL = 3;

/**
 * Whether a move would change the roster: a hire, a company bought with its
 * people, a site that comes staffed, a relic that brings a developer or
 * promotes one. The team is the showcase's, exactly, so the demo takes none.
 */
function growsTeam(action: PlayerAction): boolean {
  switch (action.type) {
    case "hire":
    case "acquire":
      return true;
    case "buy":
      return UPGRADES[action.id].hires !== undefined;
    case "choose_relic": {
      const boost = RELICS[action.relicId].boost;
      return boost?.dev !== undefined || boost?.promote === true;
    }
    default:
      return false;
  }
}

/** A showcase cannot end; the check stays so the loop can never run on a finished run. */
export function demoDone(snapshot: RunSnapshot): boolean {
  return snapshot.phase.kind === "game_over";
}

export function chooseDemo(snapshot: RunSnapshot, played: number): PlayerAction | undefined {
  const { actions, previews } = snapshot;
  const legal = (action: PlayerAction | undefined): PlayerAction | undefined =>
    action !== undefined && previews[actionKey(action)]?.blocked === undefined ? action : undefined;
  const find = (predicate: (action: PlayerAction) => boolean): PlayerAction | undefined =>
    legal(actions.find(predicate));

  let choice = chooseSupervisor({ ...snapshot, autopilot: SUPERVISOR_LEVEL })?.action;
  // The level that spends may not spend on people: one level down does not.
  if (choice !== undefined && growsTeam(choice)) {
    choice = chooseSupervisor({ ...snapshot, autopilot: SUPERVISOR_LEVEL - 1 })?.action;
  }

  // The supervisor opens the pull request as soon as the ticket is full. The
  // reviewer refuses an indebted codebase and may catch unread machine work,
  // and a refusal costs the turn: the demo cleans up first, the way the
  // careful simulator policy does.
  if (choice?.type === "submit") {
    const notes = previews[actionKey(choice)]?.notes ?? [];
    const inHand = snapshot.tickets.find((ticket) => ticket.id === snapshot.player.ticketId);
    if (notes.some((note) => note.key === "notes.health_refusal")) {
      choice =
        find((a) => a.type === "commit" && a.mode === "craft" && a.kind === "refactor") ??
        find((a) => a.type === "rest") ??
        choice;
    } else if ((inHand?.unread ?? 0) > 0) {
      choice = find((a) => a.type === "review") ?? choice;
    }
  }

  // Every other plain commit goes to the machine, when the machine may write:
  // a graph with nothing purple on it would not show what the game is about.
  if (choice?.type === "commit" && choice.kind === undefined && played % 2 === 1) {
    choice = find((a) => a.type === "commit" && a.mode === "ai" && a.kind === undefined) ?? choice;
  }

  // Phases the supervisor leaves to the player: the first answer on the table
  // that keeps the roster as it is.
  return choice ?? actions.find((action) => !growsTeam(action)) ?? actions[0];
}
