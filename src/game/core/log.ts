import { text } from "@/game/core/i18n";
import type { GameEvent, LogLine, RunState } from "@/game/core/types";

/**
 * The run's history, written as commit subjects.
 *
 * Only the events worth a line get one — energy ticks and reputation updates
 * are in the HUD, not in the log. Everything is emitted as a key, so the same
 * run reads as `fix: oups` or `fix: oops` depending on who is looking.
 */

const LOG_CAP = 200;

export function toLogLine(event: GameEvent, turn: number): LogLine | null {
  switch (event.type) {
    case "node_done":
      return {
        turn,
        kind: event.mode === "ai" ? "chore" : "feat",
        text: text(`log.node_done.${event.mode}`, { node: event.nodeId }),
      };

    case "branch_merged":
      return {
        turn,
        kind: "merge",
        text: text(
          event.skillId === undefined ? "log.branch_merged" : "log.branch_merged_skill",
          event.skillId === undefined ? {} : { skill: `skills.${event.skillId}.name` },
        ),
      };

    case "skill_gained":
      return { turn, kind: "feat", text: text("log.skill_gained", { skill: event.skillId }) };

    case "conflict":
      return { turn, kind: "fix", text: text("log.conflict") };

    case "conflict_resolved":
      return {
        turn,
        kind: "fix",
        text: text(`log.conflict_resolved.${event.how}`),
      };

    case "failure_event":
      return { turn, kind: "fix", text: text(`events.${event.eventId}.log`) };

    case "ambient_event":
      return { turn, kind: "note", text: text(`events.${event.eventId}.log`) };

    case "forced_rebase":
      return {
        turn,
        kind: event.absorbed ? "chore" : "revert",
        text: text(event.absorbed ? "log.rebase_absorbed" : "log.rebase_forced"),
      };

    case "pr_rejected":
      return {
        turn,
        kind: event.countered ? "chore" : "revert",
        text: text(event.countered ? "log.pr_countered" : "log.pr_rejected"),
      };

    case "reviewed":
      return {
        turn,
        kind: "chore",
        text: text(event.free ? "log.reviewed_free" : "log.reviewed", {
          count: event.nodeIds.length,
        }),
      };

    case "nodes_injected":
      return {
        turn,
        kind: "fix",
        text: text(`log.injected.${event.kind}`, { count: event.nodeIds.length }),
      };

    case "debt_explosion":
      return { turn, kind: "revert", text: text("log.debt_explosion") };

    case "bot_mistake":
      return { turn, kind: "revert", text: text("log.bot_mistake", { bot: event.botId }) };

    case "bot_fired":
      return { turn, kind: "merge", text: text("log.bot_fired", { bot: event.botId }) };

    case "bot_arrived":
      return {
        turn,
        kind: "note",
        text: text("log.bot_arrived", { bot: `bots.${event.archetype}.name` }),
      };

    case "sprint_ended":
      return { turn, kind: "merge", text: text("log.sprint_ended", { sprint: event.sprint }) };

    case "sprint_started":
      return { turn, kind: "note", text: text("log.sprint_started", { sprint: event.sprint }) };

    case "relic_chosen":
      return { turn, kind: "feat", text: text("log.relic_chosen", { relic: event.relicId }) };

    case "devops_placed":
      return {
        turn,
        kind: "chore",
        text: text("log.devops_placed", { devops: event.id, level: event.level }),
      };

    case "game_over":
      return {
        turn,
        kind: "revert",
        text: text(`log.game_over.${event.reason}`, { score: event.score }),
      };

    default:
      return null;
  }
}

export function appendLog(state: RunState, events: readonly GameEvent[]): void {
  for (const event of events) {
    const line = toLogLine(event, state.turn);
    if (line !== null) state.log.push(line);
  }

  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);
}
