import type { DevopsId } from "@/game/content/devops";
import type { PartialEffects } from "@/game/content/effects";
import type { FeatureSkillId } from "@/game/content/skills";

/**
 * Starters. Each one is a different answer to the game's central question —
 * how much do you trust the machine — and unlocks with banked commits.
 */

export const PROFILE_IDS = ["junior", "senior", "vibe_coder", "devops"] as const;

export type ProfileId = (typeof PROFILE_IDS)[number];

export interface ProfileDef {
  id: ProfileId;
  effects: PartialEffects;
  startingSkills: readonly FeatureSkillId[];
  startingDevops: Readonly<Partial<Record<DevopsId, number>>>;
  /** Banked commits needed to play it. The Junior is always available. */
  unlockCost: number;
}

export const PROFILES: Record<ProfileId, ProfileDef> = {
  junior: {
    id: "junior",
    // Boundless energy, no instinct for when the machine is lying.
    effects: { energyMaxBonus: 2, aiSuccessPoints: -8 },
    startingSkills: [],
    startingDevops: {},
    unlockCost: 0,
  },
  senior: {
    id: "senior",
    effects: { craftSuccessPoints: 10, conflictResistancePoints: 6, aiSuccessPoints: -4 },
    startingSkills: [],
    startingDevops: {},
    unlockCost: 300,
  },
  vibe_coder: {
    id: "vibe_coder",
    // Fast and confident, and the debt gauge is a rumour.
    effects: { aiSuccessPoints: 15, craftSuccessPoints: -6, debtFuzzBonus: 10 },
    startingSkills: ["copilot_v2"],
    startingDevops: {},
    unlockCost: 600,
  },
  devops: {
    id: "devops",
    effects: {},
    startingSkills: [],
    startingDevops: { ci: 1 },
    unlockCost: 1000,
  },
};

export function isProfileId(value: string): value is ProfileId {
  return Object.hasOwn(PROFILES, value);
}
