import { money, ref, signed, text } from "@/game/core/i18n";
import type { DevId, GameEvent, LogLine, MapNode, NodeId, RunState } from "@/game/core/types";

/**
 * The run's history, written as commit subjects.
 *
 * Only the events worth a line get one — energy ticks are in the HUD, not in
 * the log. Everything is emitted as a key, and anything that needs a *name* (a
 * skill, a relic) is emitted as a reference the renderer resolves, because the
 * engine has no idea what language it is in.
 */

const LOG_CAP = 200;

export function toLogLine(
  event: GameEvent,
  turn: number,
  seq: number,
  nodes: Readonly<Record<NodeId, MapNode>> = {},
  /** The roster's names: a line says "Nora", not "d3". */
  nameOf: (id: DevId) => string = (id) => id,
): LogLine | null {
  switch (event.type) {
    case "node_done":
      return {
        seq,
        turn,
        kind: event.mode === "ai" ? "chore" : "feat",
        text: text(`log.node_done.${event.mode}`, {
          node: ref(`nodes.${event.kind}.name`),
          subject: ref(nodes[event.nodeId]?.subjectKey ?? `nodes.${event.kind}.name`),
        }),
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

    case "pr_reviewed":
      return {
        seq,
        turn,
        kind: event.accepted ? "merge" : "revert",
        text: event.accepted
          ? text("log.pr_accepted")
          : event.bugs > 0
            ? text("log.pr_rejected_bugs", { bugs: event.bugs })
            : text("log.pr_rejected_debt"),
      };

    case "rested":
      return { seq, turn, kind: "note", text: text("log.rested", { energy: event.energy }) };

    case "tier_reached":
      return { seq, turn, kind: "feat", text: text("log.tier_reached", { tier: event.tier }) };

    case "bug_fixed":
      return { seq, turn, kind: "fix", text: text("log.bug_fixed") };

    case "debt_refactored":
      return {
        seq,
        turn,
        kind: "chore",
        text: text("log.debt_refactored", { debt: event.amount }),
      };

    case "ticket_cancelled":
      return {
        seq,
        turn,
        kind: "revert",
        text:
          event.skillId === undefined
            ? text("log.ticket_dropped", { ticket: event.ticketId })
            : text("log.ticket_cancelled", { skill: ref(`skills.${event.skillId}.name`) }),
      };

    case "obstacle_spawned":
      return {
        seq,
        turn,
        kind: "fix",
        text: text("log.obstacle_spawned", { name: ref(event.nameKey) }),
      };

    case "obstacle_cleared":
      return {
        seq,
        turn,
        kind: "merge",
        text:
          event.devId === undefined
            ? text("log.obstacle_cleared")
            : text("log.obstacle_cleared_by", { dev: nameOf(event.devId) }),
      };

    case "ticket_restarted":
      return {
        seq,
        turn,
        kind: "revert",
        text: text("log.ticket_restarted", { count: event.nodeIds.length }),
      };

    case "ticket_merged":
      return {
        seq,
        turn,
        kind: "merge",
        text:
          event.devId !== undefined
            ? text("log.ticket_merged_dev", { dev: event.devId })
            : event.skillId === undefined
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

    case "merge_event":
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
        text: text(event.kind === "keep" ? "log.relic_chosen" : "log.relic_used", {
          relic: ref(`relics.${event.relicId}.name`),
        }),
      };

    case "tree_placed":
      return {
        seq,
        turn,
        kind: "chore",
        text: text("log.tree_placed", {
          node: ref(`tree.${event.id}.name`),
          level: event.level,
        }),
      };

    case "month_closed":
      return {
        seq,
        turn,
        kind: "chore",
        text: text("log.month_closed", {
          month: event.month,
          revenue: money(event.revenue),
          costs: money(event.upkeep + event.salaries),
          money: money(event.money),
        }),
      };

    case "outage":
      return {
        seq,
        turn,
        kind: "revert",
        text: text("log.outage", {
          load: event.load,
          capacity: event.capacity,
          pct: event.overPct,
        }),
      };

    case "upgrade_bought":
      return {
        seq,
        turn,
        kind: "chore",
        text: text("log.upgrade_bought", {
          upgrade: ref(`upgrades.${event.id}.name`),
          level: event.level,
        }),
      };

    case "skill_point_bought":
      return {
        seq,
        turn,
        kind: "chore",
        text: text("log.skill_point_bought", { money: money(event.price) }),
      };

    case "hired":
      return {
        seq,
        turn,
        kind: "feat",
        text:
          event.source === undefined || "relic" in event.source
            ? text("log.hired", { dev: nameOf(event.devId), rank: ref(`ranks.${event.rank}.name`) })
            : "site" in event.source
              ? text("log.hired_by_site", {
                  dev: nameOf(event.devId),
                  rank: ref(`ranks.${event.rank}.name`),
                  site: ref(`upgrades.${event.source.site}.name`),
                })
              : text("log.hired_by_acquisition", {
                  dev: nameOf(event.devId),
                  rank: ref(`ranks.${event.rank}.name`),
                  company: ref(`acquisitions.${event.source.acquisition}.name`),
                }),
      };

    case "hack":
      return {
        seq,
        turn,
        kind: event.success ? "feat" : "revert",
        text: text(`log.hack.${event.kind}.${event.success ? "won" : "lost"}`),
      };

    case "system_note":
      return {
        seq,
        turn,
        kind: "system",
        text: text(`system.t${Math.min(6, Math.max(3, event.tier))}.${event.note}`),
      };

    case "objective_set":
      return {
        seq,
        turn,
        kind: "note",
        text: text("log.objective_set", {
          objective: ref(`objectives.${event.id}.name`),
          target: event.target,
        }),
      };

    case "objective_done":
      return {
        seq,
        turn,
        kind: "feat",
        text: text(`log.objective_done.${event.reward}`, {
          objective: ref(`objectives.${event.id}.name`),
        }),
      };

    case "objective_failed":
      return {
        seq,
        turn,
        kind: "revert",
        text: text("log.objective_failed", { objective: ref(`objectives.${event.id}.name`) }),
      };

    case "narrative_opened":
      return {
        seq,
        turn,
        kind: "note",
        text: text("log.narrative_opened", { title: ref(`narrative.${event.eventId}.title`) }),
      };

    case "narrative_answered":
      return {
        seq,
        turn,
        kind: "note",
        text: text("log.narrative_answered", {
          title: ref(`narrative.${event.eventId}.title`),
          choice: ref(`narrative.${event.eventId}.choices.${event.choice}`),
        }),
      };

    case "competitor_entered":
      return {
        seq,
        turn,
        kind: "note",
        text: text("log.competitor_entered", { company: ref(`competitors.${event.id}.name`) }),
      };

    case "competitor_merged":
      return {
        seq,
        turn,
        kind: "note",
        text: text("log.competitor_merged", {
          company: ref(`competitors.${event.id}.name`),
          into: ref(`competitors.${event.into}.name`),
        }),
      };

    case "competitor_bought":
      return {
        seq,
        turn,
        kind: "merge",
        text: text("log.competitor_bought", { company: ref(`competitors.${event.id}.name`) }),
      };

    case "price_war":
      return { seq, turn, kind: "revert", text: text("log.price_war") };

    case "share_changed":
      return {
        seq,
        turn,
        kind: event.delta > 0 ? "feat" : "revert",
        text: text(event.delta > 0 ? "log.share_up" : "log.share_down", {
          points: Math.abs(event.delta),
          pct: Math.round(event.share * 100),
        }),
      };

    case "deadline_missed":
      return {
        seq,
        turn,
        kind: "revert",
        text: text(
          `log.deadline_missed.${event.cancelled ? "cancelled" : event.kind === "vip" ? "vip" : "late"}`,
        ),
      };

    case "acquired":
      return {
        seq,
        turn,
        kind: "merge",
        text: text("log.acquired", {
          company: ref(`acquisitions.${event.id}.name`),
          devs: event.devIds.length,
          features: event.ticketIds.length,
        }),
      };

    case "capacity_warning":
      return {
        seq,
        turn,
        kind: "note",
        text:
          event.advice === undefined
            ? text(`log.capacity.${event.level}`, {
                projected: event.projected,
                capacity: event.capacity,
              })
            : text(`log.capacity.${event.level}_advised`, {
                projected: event.projected,
                capacity: event.capacity,
                upgrade: ref(`upgrades.${event.advice.id}.name`),
                money: money(event.advice.cost),
              }),
      };

    case "dev_left":
      return {
        seq,
        turn,
        kind: "revert",
        text: text("log.dev_left", { dev: event.name, count: event.ticketIds.length }),
      };

    case "dev_promoted":
      return {
        seq,
        turn,
        kind: "feat",
        text: text("log.dev_promoted", {
          dev: nameOf(event.devId),
          rank: ref(`ranks.${event.rank}.name`),
        }),
      };

    case "ticket_assigned":
      return {
        seq,
        turn,
        kind: "note",
        text: text("log.ticket_assigned_dev", { dev: nameOf(event.devId) }),
      };

    case "game_over":
      return {
        seq,
        turn,
        kind: "revert",
        text: text(`log.game_over.${event.reason}`, { score: event.score }),
      };

    // Every move of production's patience is a line: the gauge is what ends
    // the run, and a number that moves in silence is the one nobody can act on.
    case "quality":
      return {
        seq,
        turn,
        kind: event.delta < 0 ? "feat" : "revert",
        // Told as the HUD shows it: production's patience, full when all is
        // well, so a rise of the engine's impatience is a loss of patience.
        text: text(`log.quality.${event.source}`, {
          change: signed(-event.delta),
          left: event.max - event.value,
          max: event.max,
        }),
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
    case "skill_points":
    case "money":
    case "crunch":
      return null;
  }
}

export function appendLog(state: RunState, events: readonly GameEvent[]): void {
  const nameOf = (id: DevId): string => state.devs.find((dev) => dev.id === id)?.name ?? id;
  for (const event of events) {
    const line = toLogLine(event, state.turn, state.nextLogSeq, state.nodes, nameOf);
    if (line === null) continue;
    state.nextLogSeq += 1;
    state.log.push(line);
  }

  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);
}
