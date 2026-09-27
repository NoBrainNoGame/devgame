import type { PlayerAction, RunSnapshot } from "@/game";

type Commit = Extract<PlayerAction, { type: "commit" }>;

/**
 * Where each way of writing the commit sits in the action panel. Below the
 * main actions, as ways to write it instead — except a refactor when only
 * the codebase's health keeps the ticket's pull request shut: it is the way
 * forward then, and it goes among the main actions, above resting.
 */
export function placeDetours(
  written: readonly Commit[],
  current: Pick<RunSnapshot["tickets"][number], "waitingOnHealth"> | undefined,
): { main: Commit[]; instead: Commit[] } {
  const needed = current?.waitingOnHealth === true;
  const main = written.filter((action) => needed && action.kind === "refactor");
  return { main, instead: written.filter((action) => !main.includes(action)) };
}
