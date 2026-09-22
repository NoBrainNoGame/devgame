/**
 * Three tables.
 *
 * Failures are drawn when a commit roll misses. Each one has a bespoke
 * consequence, so the table only carries the odds and the eligibility, and
 * `rules/events.ts` switches on the id — exhaustively, so adding an entry here
 * is a type error until the rule exists.
 *
 * Merge events are what happens when a ticket lands and something happens.
 * `performMerge` rolls once for whether anything does, then draws from this
 * table: a conflict opens the resolution choice, the others cost something and
 * land anyway.
 *
 * Ambient events are the small weather of a working week, drawn now and then
 * after a successful commit. Their whole effect fits in the table.
 */

export const FAILURE_EVENT_IDS = [
  "merge_conflict",
  "prod_bug",
  "pr_rejected",
  "broken_build",
] as const;

export type FailureEventId = (typeof FAILURE_EVENT_IDS)[number];

export interface FailureEventDef {
  id: FailureEventId;
  weight: number;
  /** Needs at least one unreviewed AI commit on the ticket being written. */
  requiresUnreviewedAi: boolean;
  /** Cannot fire while the player is writing a hotfix. */
  forbiddenOnHotfix: boolean;
}

export const FAILURE_EVENTS: Record<FailureEventId, FailureEventDef> = {
  // Only ever drawn on a rebase: a conflict needs two histories to meet.
  merge_conflict: {
    id: "merge_conflict",
    weight: 25,
    requiresUnreviewedAi: false,
    forbiddenOnHotfix: false,
  },
  prod_bug: {
    id: "prod_bug",
    weight: 35,
    // Something has to have shipped unread for production to break.
    requiresUnreviewedAi: true,
    // Stacking a hotfix on a hotfix is a spiral, not a game.
    forbiddenOnHotfix: true,
  },
  pr_rejected: {
    id: "pr_rejected",
    weight: 20,
    requiresUnreviewedAi: false,
    forbiddenOnHotfix: false,
  },
  broken_build: {
    id: "broken_build",
    weight: 20,
    requiresUnreviewedAi: false,
    forbiddenOnHotfix: false,
  },
};

export const MERGE_EVENT_IDS = [
  "merge_conflict",
  "new_lib_migration",
  "flaky_ci",
  "review_nitpick",
] as const;

export type MergeEventId = (typeof MERGE_EVENT_IDS)[number];

export interface MergeEventDef {
  id: MergeEventId;
  weight: number;
  /** `conflict` opens the resolution choice; `resolve` lands the ticket after the effect. */
  outcome: "conflict" | "resolve";
  effect: { energy?: number; debt?: number };
  /** The merge lands without handing energy back. */
  noRegen: boolean;
  /** Dependabot removes this one from the table entirely. */
  cancelledByDependabot: boolean;
}

export const MERGE_EVENTS: Record<MergeEventId, MergeEventDef> = {
  merge_conflict: {
    id: "merge_conflict",
    weight: 45,
    outcome: "conflict",
    effect: {},
    noRegen: false,
    cancelledByDependabot: false,
  },
  // Moving to a new library: it costs, it leaves a mess, and it merges.
  new_lib_migration: {
    id: "new_lib_migration",
    weight: 25,
    outcome: "resolve",
    effect: { energy: -2, debt: 6 },
    noRegen: false,
    cancelledByDependabot: true,
  },
  flaky_ci: {
    id: "flaky_ci",
    weight: 20,
    outcome: "resolve",
    effect: { energy: -1 },
    noRegen: false,
    cancelledByDependabot: false,
  },
  // The merge goes through, but nobody gets to rest on it.
  review_nitpick: {
    id: "review_nitpick",
    weight: 10,
    outcome: "resolve",
    effect: {},
    noRegen: true,
    cancelledByDependabot: false,
  },
};

export const AMBIENT_EVENT_IDS = [
  "helpful_colleague",
  "perfect_lib",
  "no_meeting_friday",
  "obsolete_lib",
  "dependency_bump",
] as const;

export type AmbientEventId = (typeof AMBIENT_EVENT_IDS)[number];

export interface AmbientEventDef {
  id: AmbientEventId;
  weight: number;
  effect: { energy?: number; debt?: number };
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
    effect: { energy: 1 },
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
  dependency_bump: {
    id: "dependency_bump",
    weight: 15,
    effect: { energy: -1, debt: 3 },
    cancelledByDependabot: true,
  },
};

export type EventId = FailureEventId | MergeEventId | AmbientEventId;
