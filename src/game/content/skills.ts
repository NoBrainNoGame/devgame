import type { PartialEffects } from "@/game/content/effects";

/**
 * Skills are permanent for the length of a run. Twelve of them are feature
 * branches you merge; four are trophies for getting a rival bot fired and can
 * never appear on the map.
 */

export const FEATURE_SKILL_IDS = [
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
] as const;

export const BOT_SKILL_IDS = ["sprint_final", "lynx_eye", "rebase_master", "zen"] as const;

export const SKILL_IDS = [...FEATURE_SKILL_IDS, ...BOT_SKILL_IDS] as const;

export type FeatureSkillId = (typeof FEATURE_SKILL_IDS)[number];
export type BotSkillId = (typeof BOT_SKILL_IDS)[number];
export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDef {
  id: SkillId;
  /** Feature skills are drawn onto branches; bot skills are only ever awarded. */
  source: "feature" | "bot";
  effects: PartialEffects;
  /** Commits banked before this one may appear in a run. 0 = available from the start. */
  unlockCost: number;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  unit_tests: {
    id: "unit_tests",
    source: "feature",
    effects: { aiSuccessPoints: 12, counterPrRejection: true },
    unlockCost: 0,
  },
  ci_cd: {
    id: "ci_cd",
    source: "feature",
    // Large enough to cover any merge cost; merge costs clamp at zero.
    effects: { mergeEnergyDiscount: 99 },
    unlockCost: 0,
  },
  linter: {
    id: "linter",
    source: "feature",
    effects: { debtVisible: true, debtDecayPerTurn: 1 },
    unlockCost: 0,
  },
  pair_programming: {
    id: "pair_programming",
    source: "feature",
    effects: { reviewEnergyDiscount: 1, rerollFailedRoll: true },
    unlockCost: 0,
  },
  copilot_v2: {
    id: "copilot_v2",
    source: "feature",
    effects: { aiSuccessPoints: 10 },
    unlockCost: 0,
  },
  coffee: {
    id: "coffee",
    source: "feature",
    effects: { energyMaxBonus: 3 },
    unlockCost: 0,
  },
  strict_typing: {
    id: "strict_typing",
    source: "feature",
    effects: { allSuccessPoints: 6 },
    unlockCost: 150,
  },
  documentation: {
    id: "documentation",
    source: "feature",
    effects: { reviewExtraCommits: 2 },
    unlockCost: 150,
  },
  hot_reload: {
    id: "hot_reload",
    source: "feature",
    effects: { craftSuccessPoints: 8 },
    unlockCost: 300,
  },
  observability: {
    id: "observability",
    source: "feature",
    effects: { monitoring: true },
    unlockCost: 300,
  },
  rubber_duck: {
    id: "rubber_duck",
    source: "feature",
    effects: { conflictResistancePoints: 10 },
    unlockCost: 500,
  },
  feature_flags: {
    id: "feature_flags",
    source: "feature",
    effects: { absorbRebase: true },
    unlockCost: 500,
  },

  sprint_final: {
    id: "sprint_final",
    source: "bot",
    effects: { aiJumpBonus: 1 },
    unlockCost: 0,
  },
  lynx_eye: {
    id: "lynx_eye",
    source: "bot",
    effects: { debtVisible: true },
    unlockCost: 0,
  },
  rebase_master: {
    id: "rebase_master",
    source: "bot",
    effects: { absorbRebase: true },
    unlockCost: 0,
  },
  zen: {
    id: "zen",
    source: "bot",
    effects: { mergeRegenBonus: 1 },
    unlockCost: 0,
  },
};

export function isSkillId(value: string): value is SkillId {
  return Object.hasOwn(SKILLS, value);
}
