/**
 * Two tables.
 *
 * Failures are drawn when a commit roll misses. Each one has a bespoke
 * consequence, so the table only carries the odds and the eligibility, and
 * `rules/events.ts` switches on the id — exhaustively, so adding an entry here
 * is a type error until the rule exists.
 *
 * Ambient events are the small weather of a working week. They are drawn on
 * `chore` nodes and, rarely, after a successful commit. Their whole effect fits
 * in the table.
 */

export const FAILURE_EVENT_IDS = [
  "merge_conflict",
  "prod_bug",
  "pr_rejected",
  "forced_rebase",
] as const;

export type FailureEventId = (typeof FAILURE_EVENT_IDS)[number];

export interface FailureEventDef {
  id: FailureEventId;
  weight: number;
  /** Needs at least one unreviewed AI commit still in the window. */
  requiresUnreviewedAi: boolean;
  /** Cannot fire while the player is already on a hotfix branch. */
  forbiddenOnHotfix: boolean;
}

export const FAILURE_EVENTS: Record<FailureEventId, FailureEventDef> = {
  merge_conflict: {
    id: "merge_conflict",
    weight: 40,
    requiresUnreviewedAi: false,
    forbiddenOnHotfix: false,
  },
  prod_bug: {
    id: "prod_bug",
    weight: 20,
    // Something has to have shipped unread for production to break.
    requiresUnreviewedAi: true,
    // Stacking a hotfix on a hotfix is a spiral, not a game.
    forbiddenOnHotfix: true,
  },
  pr_rejected: {
    id: "pr_rejected",
    weight: 15,
    requiresUnreviewedAi: false,
    forbiddenOnHotfix: false,
  },
  forced_rebase: {
    id: "forced_rebase",
    weight: 15,
    requiresUnreviewedAi: false,
    forbiddenOnHotfix: false,
  },
};

export const AMBIENT_EVENT_IDS = [
  "helpful_colleague",
  "perfect_lib",
  "no_meeting_friday",
  "obsolete_lib",
] as const;

export type AmbientEventId = (typeof AMBIENT_EVENT_IDS)[number];

export interface AmbientEventDef {
  id: AmbientEventId;
  weight: number;
  effect: { energy?: number; progress?: number; debt?: number };
  /** Dependabot removes this one from the table entirely. */
  cancelledByDependabot: boolean;
}

export const AMBIENT_EVENTS: Record<AmbientEventId, AmbientEventDef> = {
  helpful_colleague: {
    id: "helpful_colleague",
    weight: 30,
    effect: { energy: 2 },
    cancelledByDependabot: false,
  },
  perfect_lib: {
    id: "perfect_lib",
    weight: 20,
    effect: { progress: 1 },
    cancelledByDependabot: false,
  },
  no_meeting_friday: {
    id: "no_meeting_friday",
    weight: 25,
    effect: { energy: 3 },
    cancelledByDependabot: false,
  },
  obsolete_lib: {
    id: "obsolete_lib",
    weight: 25,
    effect: { energy: -1 },
    cancelledByDependabot: true,
  },
};

export type EventId = FailureEventId | AmbientEventId;
