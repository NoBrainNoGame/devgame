import { chooseAutopilot } from "@/game/bridge/autopilot";
import type { SessionOptions } from "@/game/bridge/session";
import type { RunSnapshot } from "@/game/bridge/snapshot";
import type { PlayerAction } from "@/game/core/types";
import { emptyMeta } from "@/game/dto/meta";

/**
 * The run the landing page shows.
 *
 * It is not a drawing of a run: it is one, played by the game's own autopilot
 * against the game's own engine and drawn by the game's own scene, so it stays
 * true to how the game writes a graph whatever the rules become. The one
 * liberty is a taste for the machine: the autopilot never lets it write, and a
 * graph with nothing purple on it would not show what the game is about.
 *
 * Everything here is deterministic — a fixed seed, a fixed policy — so the
 * page shows the same sprint to everyone, and a test can play it headless.
 */

export const DEMO_SESSION: Omit<SessionOptions, "resumeActions"> = {
  seed: "devgame-landing",
  mode: "classic",
  profileId: "junior",
  meta: emptyMeta("2026-01-01T00:00:00.000Z"),
  clientRunId: "00000000-0000-4000-8000-000000000000",
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** The demo stops once the first release is on the graph, or well before if something is off. */
export const DEMO_MAX_ACTIONS = 40;

export function demoDone(snapshot: RunSnapshot, played: number): boolean {
  return snapshot.sprint >= 2 || snapshot.phase.kind === "game_over" || played >= DEMO_MAX_ACTIONS;
}

export function chooseDemo(snapshot: RunSnapshot, played: number): PlayerAction | undefined {
  const choice = chooseAutopilot(snapshot);

  // Every other plain commit goes to the machine, when the machine may write.
  if (choice?.type === "commit" && choice.kind === undefined && played % 2 === 1) {
    const machine = snapshot.actions.find(
      (action) => action.type === "commit" && action.mode === "ai" && action.kind === undefined,
    );
    if (machine !== undefined) return machine;
  }
  if (choice !== undefined) return choice;

  // Phases the autopilot leaves to the player: the first answer on the table.
  return snapshot.actions[0];
}
