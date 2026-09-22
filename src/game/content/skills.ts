import type { PartialEffects } from "@/game/content/effects";

/**
 * Skills are permanent for the length of a run. Every one of them is the reward
 * of a ticket you delivered.
 */

export const SKILL_IDS = [
  "code_review",
  "unit_tests",
  "ci_cd",
  "linter",
  "pair_programming",
  "copilot_v2",
  "coffee",
  "strict_typing",
  "documentation",
  "hot_reload",
  "observability",
  "rubber_duck",
  "feature_flags",
  "sprint_final",
  "lynx_eye",
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDef {
  id: SkillId;
  effects: PartialEffects;
  /** Commits banked before this one may appear in a run. 0 = available from the start. */
  unlockCost: number;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  // The review action does not exist until a run merges this. See `canReview`.
  code_review: {
    id: "code_review",
    effects: { canReview: true },
    unlockCost: 0,
  },
  unit_tests: {
    id: "unit_tests",
    effects: { aiSuccessPoints: 12, counterPrRejection: true },
    unlockCost: 0,
  },
  ci_cd: {
    id: "ci_cd",
    // A bigger rest, not a free one. Every feature now ends in a merge, so a
    // discount that covered the whole cost made energy a resource that only
    // ever went up.
    effects: { mergeRegenBonus: 2 },
    unlockCost: 0,
  },
  linter: {
    id: "linter",
    effects: { debtVisible: true, debtDecayPerTurn: 1 },
    unlockCost: 0,
  },
  pair_programming: {
    id: "pair_programming",
    effects: { canReview: true, reviewEnergyDiscount: 1, rerollFailedRoll: true },
    unlockCost: 0,
  },
  copilot_v2: {
    id: "copilot_v2",
    effects: { aiSuccessPoints: 10 },
    unlockCost: 0,
  },
  coffee: {
    id: "coffee",
    effects: { energyMaxBonus: 3 },
    unlockCost: 0,
  },
  strict_typing: {
    id: "strict_typing",
    effects: { allSuccessPoints: 6 },
    unlockCost: 150,
  },
  documentation: {
    id: "documentation",
    effects: { reviewExtraCommits: 2 },
    unlockCost: 150,
  },
  hot_reload: {
    id: "hot_reload",
    effects: { craftSuccessPoints: 8 },
    unlockCost: 300,
  },
  observability: {
    id: "observability",
    effects: { monitoring: true },
    unlockCost: 300,
  },
  rubber_duck: {
    id: "rubber_duck",
    effects: { conflictResistancePoints: 10 },
    unlockCost: 500,
  },
  feature_flags: {
    id: "feature_flags",
    effects: { absorbRebase: true },
    unlockCost: 500,
  },

  sprint_final: {
    id: "sprint_final",
    // The machine's debt, discounted: the only skill that makes the fast route
    // cheaper to keep taking rather than safer to take once.
    effects: { aiDebtDiscount: 3 },
    unlockCost: 300,
  },
  lynx_eye: {
    id: "lynx_eye",
    effects: { debtVisible: true },
    unlockCost: 300,
  },
};

export function isSkillId(value: string): value is SkillId {
  return Object.hasOwn(SKILLS, value);
}

/**
 * What a brand-new account starts with, derived from the table rather than
 * listed again beside it.
 *
 * It used to be written out in three places — here by `unlockCost`, in
 * `createRun`, and in `emptyMeta` — with nothing keeping them in step. Letting
 * them drift has no symptom: the skill simply never appears on a map, and the
 * player never learns it existed.
 */
export function freeFeatureSkills(): SkillId[] {
  return SKILL_IDS.filter((id) => SKILLS[id].unlockCost === 0).sort();
}
