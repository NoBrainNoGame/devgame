import type { PartialEffects } from "@/game/content/effects";

/**
 * "Project improvements", offered as a choice of three at the end of every
 * sprint. They are the run's long game: unlike skills they cost no map
 * progress, which is the reward for surviving a sprint.
 */

export const RELIC_IDS = [
  "agile_board",
  "tech_radar",
  "code_freeze",
  "onboarding",
  "retrospective",
  "war_room",
  "four_day_week",
  "open_source",
] as const;

export type RelicId = (typeof RELIC_IDS)[number];

export interface RelicDef {
  id: RelicId;
  /** Permanent, recomputed every turn. */
  effects: PartialEffects;
  /** Applied once, the moment the relic is picked. */
  grant?: { devopsPoints?: number; energy?: number; debt?: number };
  /** A relic may only be offered once per run. */
  unique: true;
}

export const RELICS: Record<RelicId, RelicDef> = {
  agile_board: {
    id: "agile_board",
    effects: { energyMaxBonus: 2 },
    unique: true,
  },
  tech_radar: {
    id: "tech_radar",
    effects: { allSuccessPoints: 5 },
    unique: true,
  },
  code_freeze: {
    id: "code_freeze",
    effects: { debtDecayPerTurn: 1 },
    grant: { debt: -15 },
    unique: true,
  },
  onboarding: {
    id: "onboarding",
    effects: {},
    grant: { devopsPoints: 2 },
    unique: true,
  },
  retrospective: {
    id: "retrospective",
    effects: { reviewExtraCommits: 1 },
    unique: true,
  },
  war_room: {
    id: "war_room",
    effects: { monitoring: true },
    unique: true,
  },
  four_day_week: {
    id: "four_day_week",
    effects: { mergeRegenBonus: 2 },
    unique: true,
  },
  open_source: {
    id: "open_source",
    effects: { aiSuccessPoints: 8 },
    unique: true,
  },
};
