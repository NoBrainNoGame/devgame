import type { CommitMode, NodeKind } from "@/game/core/types";

/**
 * What a commit says, and what a feature is called.
 *
 * The graph reads as a history because every node carries a subject line,
 * and the subjects tell the run's story without the run ever saying it: a
 * billing tool at the start, a product whose scope drifts as the tiers
 * climb — see `docs/lore.md`. Pools are banded by tier; the index in a pool
 * is a hash of the seed and the node's id, never a draw from the PRNG, so
 * the flavour costs the replay nothing.
 *
 * Only the *keys* live here. The strings are in `messages/*.json`, and
 * `tests/messages.test.ts` enumerates every key these sizes imply.
 */

export const SUBJECT_PREFIXES = [
  "feat",
  "chore",
  "fix",
  "merge",
  "refactor",
  "docs",
  "perf",
  "squash",
  "rebase",
  "init",
  "release",
] as const;

export type SubjectPrefix = (typeof SUBJECT_PREFIXES)[number];

/** The tiers a band covers: a band is named after its first tier. */
export const SUBJECT_BANDS = [0, 2, 4, 6] as const;
export type SubjectBand = (typeof SUBJECT_BANDS)[number];

/** The prefixes whose pools change with the tier. The rest are timeless. */
export const BANDED_PREFIXES: ReadonlySet<SubjectPrefix> = new Set<SubjectPrefix>([
  "feat",
  "chore",
  "fix",
  "merge",
]);

export const SUBJECT_POOL_SIZE = 6;
export const FEATURE_POOL_SIZE = 8;

export function bandOf(tier: number): SubjectBand {
  let band: SubjectBand = 0;
  for (const candidate of SUBJECT_BANDS) if (tier >= candidate) band = candidate;
  return band;
}

/**
 * The conventional-commit prefix a node carries, so the graph reads like a
 * history rather than a diagram.
 */
export function nodePrefix(kind: NodeKind, mode: CommitMode | undefined): SubjectPrefix {
  switch (kind) {
    case "feature_merge":
    case "obstacle_merge":
    case "sprint_merge":
      return "merge";
    case "hotfix":
    case "fix":
      return "fix";
    case "refactor":
      return "refactor";
    case "release":
      return "release";
    case "squash":
      return "squash";
    case "docs":
      return "docs";
    case "rebase":
      return "rebase";
    case "risky":
      return "perf";
    case "init":
    case "sprint_start":
      return "init";
    case "commit":
      return mode === "ai" ? "chore" : "feat";
  }
}

/** The i18n key of a commit subject: `subjects.<prefix>.<band|all>.<index>`. */
export function subjectKey(prefix: SubjectPrefix, tier: number, hash: number): string {
  const pool = BANDED_PREFIXES.has(prefix) ? `t${bandOf(tier)}` : "all";
  return `subjects.${prefix}.${pool}.${Math.abs(hash) % SUBJECT_POOL_SIZE}`;
}

/** The i18n key of a feature's name: `features.t<band>.<index>`. */
export function featureNameKey(tier: number, hash: number): string {
  return `features.t${bandOf(tier)}.${Math.abs(hash) % FEATURE_POOL_SIZE}`;
}

/** Every subject key the catalogues must carry. */
export function allSubjectKeys(): string[] {
  const keys: string[] = [];
  for (const prefix of SUBJECT_PREFIXES) {
    const pools = BANDED_PREFIXES.has(prefix) ? SUBJECT_BANDS.map((b) => `t${b}`) : ["all"];
    for (const pool of pools) {
      for (let i = 0; i < SUBJECT_POOL_SIZE; i += 1) keys.push(`subjects.${prefix}.${pool}.${i}`);
    }
  }
  return keys;
}

/** Every feature-name key the catalogues must carry. */
export function allFeatureKeys(): string[] {
  return SUBJECT_BANDS.flatMap((band) =>
    Array.from({ length: FEATURE_POOL_SIZE }, (_, i) => `features.t${band}.${i}`),
  );
}
