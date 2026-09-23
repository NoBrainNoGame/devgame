import type { GameEvent } from "@/game/core/types";

/**
 * The sounds, and which event plays which. The switch is exhaustive on
 * purpose: a new event does not compile until someone has said whether it
 * makes a sound, so nothing is ever silent by accident.
 */

export const SFX_IDS = [
  "commit_craft",
  "commit_ai",
  "roll_fail",
  "review",
  "merge",
  "release",
  "relic",
  "payday",
  "incident",
  "conflict",
  "explosion",
  "hire",
  "leave",
  "outage",
  "event_open",
  "event_answer",
  "objective",
  "tier_up",
  "deadline",
  "crunch",
  "game_over",
] as const;

export type SfxId = (typeof SFX_IDS)[number];

export function sfxFor(event: GameEvent): SfxId | null {
  switch (event.type) {
    case "node_done":
      return event.kind === "release"
        ? "release"
        : event.kind === "feature_merge" || event.kind === "sprint_merge"
          ? "merge"
          : event.mode === "ai"
            ? "commit_ai"
            : "commit_craft";
    case "roll":
      return event.success ? null : "roll_fail";
    case "reviewed":
    case "pr_reviewed":
      return "review";
    case "relic_chosen":
      return "relic";
    case "month_closed":
      return "payday";
    case "incident":
      return "incident";
    case "conflict":
      return "conflict";
    case "debt_explosion":
      return "explosion";
    case "hired":
      return "hire";
    case "dev_left":
      return "leave";
    case "outage":
      return "outage";
    case "narrative_opened":
      return "event_open";
    case "narrative_answered":
      return "event_answer";
    case "objective_done":
    case "objective_failed":
      return "objective";
    case "tier_reached":
      return "tier_up";
    case "deadline_missed":
      return "deadline";
    case "crunch":
      return event.active ? "crunch" : null;
    case "game_over":
      return "game_over";
    // Heard through what they cause, or not worth a sound of their own.
    case "turn_started":
    case "points":
    case "energy":
    case "rested":
    case "debt":
    case "ticket_arrived":
    case "ticket_started":
    case "checkout":
    case "ticket_restarted":
    case "ticket_cancelled":
    case "bug_fixed":
    case "debt_refactored":
    case "docs_written":
    case "docs_used":
    case "rebased":
    case "squashed":
    case "ticket_merged":
    case "skill_gained":
    case "conflict_resolved":
    case "pr_rejected":
    case "failure_event":
    case "merge_event":
    case "ambient_event":
    case "monitoring_warning":
    case "quality":
    case "sprint_ended":
    case "sprint_started":
    case "skill_points":
    case "tree_placed":
    case "money":
    case "upgrade_bought":
    case "skill_point_bought":
    case "dev_promoted":
    case "ticket_assigned":
    case "acquired":
    case "capacity_warning":
    case "hack":
    case "competitor_entered":
    case "competitor_merged":
    case "competitor_bought":
    case "price_war":
    case "share_changed":
    case "objective_set":
    case "system_note":
      return null;
  }
}
