import type { PartialEffects } from "@/game/content/effects";
import type { SkillId } from "@/game/content/skills";
import type { TreeNodeId } from "@/game/content/tree";

/**
 * Starters. Each one is a different answer to the game's central question —
 * how much do you trust the machine — and unlocks with banked commits.
 */

export const PROFILE_IDS = ["junior", "senior", "vibe_coder", "devops"] as const;

export type ProfileId = (typeof PROFILE_IDS)[number];

export interface ProfileDef {
  id: ProfileId;
  effects: PartialEffects;
  startingSkills: readonly SkillId[];
  startingTree: Readonly<Partial<Record<TreeNodeId, number>>>;
  /** Banked commits needed to play it. The Junior is always available. */
  unlockCost: number;
}

export const PROFILES: Record<ProfileId, ProfileDef> = {
  junior: {
    id: "junior",
    // Boundless energy, no instinct for when the machine is lying.
    effects: { energyMaxBonus: 2, aiSuccessPoints: -8 },
    startingSkills: [],
    startingTree: {},
    unlockCost: 0,
  },
  senior: {
    id: "senior",
    effects: { craftSuccessPoints: 10, conflictResistancePoints: 6, aiSuccessPoints: -4 },
    startingSkills: [],
    startingTree: {},
    unlockCost: 300,
  },
  vibe_coder: {
    id: "vibe_coder",
    // Fast and confident, and the debt gauge is a rumour.
    effects: { aiSuccessPoints: 15, craftSuccessPoints: -6, debtFuzzBonus: 10 },
    startingSkills: ["copilot_v2"],
    startingTree: {},
    unlockCost: 600,
  },
  devops: {
    id: "devops",
    effects: {},
    startingSkills: [],
    startingTree: { ci: 1 },
    unlockCost: 1000,
  },
};

export function isProfileId(value: string): value is ProfileId {
  return Object.hasOwn(PROFILES, value);
}
