import { ref, text } from "@/game/core/i18n";
import type { GameEvent, LogLine, RunState } from "@/game/core/types";

/**
 * The run's history, written as commit subjects.
 *
 * Only the events worth a line get one — energy ticks are in the HUD, not in
 * the log. Everything is emitted as a key, and anything that needs a *name* (a
 * skill, a relic) is emitted as a reference the renderer resolves, because the
 * engine has no idea what language it is in.
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

    case "ticket_arrived":
      return { seq, turn, kind: "note", text: text("log.ticket_arrived") };

    case "ticket_started":
      return {
        seq,
        turn,
        kind: event.kind === "hotfix" ? "fix" : "note",
        text: text(event.forced ? `log.ticket_assigned.${event.kind}` : "log.ticket_started"),
      };

    case "ticket_merged":
      return {
        seq,
        turn,
        kind: "merge",
        text:
          event.skillId === undefined
            ? text("log.ticket_merged")
            : text("log.ticket_merged_skill", { skill: ref(`skills.${event.skillId}.name`) }),
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

    case "incident":
      return { seq, turn, kind: "revert", text: text(`log.incident.${event.source}`) };

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

    case "squashed":
      return {
        seq,
        turn,
        kind: "revert",
        text: text("log.squashed", {
          count: event.nodeIds.length,
          lost: event.commitsLost,
        }),
      };

    case "docs_written":
      return { seq, turn, kind: "chore", text: text("log.docs_written", { count: event.charges }) };

    case "rebased":
      return { seq, turn, kind: "chore", text: text("log.rebased") };

    case "debt_explosion":
      return { seq, turn, kind: "revert", text: text("log.debt_explosion") };

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

    // Listed rather than defaulted: a new event should fail to compile here,
    // not silently vanish from the log.
    case "turn_started":
    case "roll":
    case "points":
    case "energy":
    case "debt":
    case "checkout":
    case "docs_used":
    case "quality":
    case "devops_points":
    case "crunch":
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
