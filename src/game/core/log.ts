import { ref, text } from "@/game/core/i18n";
import type { GameEvent, LogLine, RunState } from "@/game/core/types";

/**
 * The run's history, written as commit subjects.
 *
 * Only the events worth a line get one — energy ticks and reputation updates
 * are in the HUD, not in the log. Everything is emitted as a key, and anything
 * that needs a *name* (a skill, a bot archetype) is emitted as a reference the
 * renderer resolves, because the engine has no idea what language it is in.
 */

const LOG_CAP = 200;

export function toLogLine(event: GameEvent, turn: number, seq: number): LogLine | null {
  switch (event.type) {
    case "node_done":
      return {
        seq,
        turn,
        kind: event.mode === "ai" ? "chore" : "feat",
        text: text(`log.node_done.${event.mode}`, { node: ref(`nodes.${event.kind}.name`) }),
      };

    case "branch_merged":
      return {
        seq,
        turn,
        kind: "merge",
        text:
          event.skillId === undefined
            ? text("log.branch_merged")
            : text("log.branch_merged_skill", { skill: ref(`skills.${event.skillId}.name`) }),
      };

    case "skill_gained":
      return {
        seq,
        turn,
        kind: "feat",
        text: text("log.skill_gained", { skill: ref(`skills.${event.skillId}.name`) }),
      };

    case "conflict":
      return { seq, turn, kind: "fix", text: text("log.conflict") };

    case "conflict_resolved":
      return { seq, turn, kind: "fix", text: text(`log.conflict_resolved.${event.how}`) };

    case "failure_event":
      return { seq, turn, kind: "fix", text: text(`events.${event.eventId}.log`) };

    case "monitoring_warning":
      return { seq, turn, kind: "chore", text: text("log.monitoring_warning") };

    case "ambient_event":
      return { seq, turn, kind: "note", text: text(`events.${event.eventId}.log`) };

    case "forced_rebase":
      return {
        seq,
        turn,
        kind: event.absorbed ? "chore" : "revert",
        text: text(event.absorbed ? "log.rebase_absorbed" : "log.rebase_forced"),
      };

    case "pr_rejected":
      return {
        seq,
        turn,
        kind: event.countered ? "chore" : "revert",
        text: text(event.countered ? "log.pr_countered" : "log.pr_rejected"),
      };

    case "reviewed":
      return {
        seq,
        turn,
        kind: "chore",
        text: text(event.free ? "log.reviewed_free" : "log.reviewed", {
          count: event.nodeIds.length,
        }),
      };

    case "nodes_injected":
      return {
        seq,
        turn,
        kind: "fix",
        text: text(`log.injected.${event.kind}`, { count: event.nodeIds.length }),
      };

    case "debt_explosion":
      return { seq, turn, kind: "revert", text: text("log.debt_explosion") };

    case "bot_mistake":
      return {
        seq,
        turn,
        kind: "revert",
        text: text("log.bot_mistake", { bot: ref(`bots.${event.archetype}.name`) }),
      };

    case "bot_fired":
      return {
        seq,
        turn,
        kind: "merge",
        text: text("log.bot_fired", { bot: ref(`bots.${event.archetype}.name`) }),
      };

    case "bot_arrived":
      return {
        seq,
        turn,
        kind: "note",
        text: text("log.bot_arrived", { bot: ref(`bots.${event.archetype}.name`) }),
      };

    case "sprint_ended":
      return { seq, turn, kind: "merge", text: text("log.sprint_ended", { sprint: event.sprint }) };

    case "sprint_started":
      return {
        seq,
        turn,
        kind: "note",
        text: text("log.sprint_started", { sprint: event.sprint }),
      };

    case "relic_chosen":
      return {
        seq,
        turn,
        kind: "feat",
        text: text("log.relic_chosen", { relic: ref(`relics.${event.relicId}.name`) }),
      };

    case "devops_placed":
      return {
        seq,
        turn,
        kind: "chore",
        text: text("log.devops_placed", {
          devops: ref(`devops.${event.id}.name`),
          level: event.level,
        }),
      };

    case "game_over":
      return {
        seq,
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
    const line = toLogLine(event, state.turn, state.nextLogSeq);
    if (line === null) continue;
    state.nextLogSeq += 1;
    state.log.push(line);
  }

  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);
}
