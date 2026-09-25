import type { CompetitorId } from "@/game/content/competitors";
import type { PartialEffects } from "@/game/content/effects";
import type { SkillId } from "@/game/content/skills";
import type { TreeNodeId } from "@/game/content/tree";

/**
 * Starters. Each one is a different answer to the game's central question —
 * how much do you trust the machine — and unlocks with banked commits. The
 * three that cost something are sidegrades priced by how much they ask of
 * the player, not a ladder of strength: measured on the same seeds, AI-heavy
 * play, each of them survives the early game about as often as the others.
 *
 * Each also has a past (`docs/lore.md`, "Les profils"): one of the house
 * companies it owes something to, one it holds a grudge against. Both show
 * on the market, and each has a personal question that only this starter is
 * ever asked (`profile` in `narrative.ts`).
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
  /** The company this starter owes something to. */
  ally: CompetitorId;
  /** The company this starter holds a grudge against. */
  rival: CompetitorId;
}

export const PROFILES: Record<ProfileId, ProfileDef> = {
  junior: {
    id: "junior",
    // More energy than anyone, no instinct for when the machine is lying.
    effects: { energyMaxBonus: 4, aiSuccessPoints: -4 },
    startingSkills: [],
    startingTree: {},
    unlockCost: 0,
    ally: "brume",
    rival: "sept",
  },
  senior: {
    id: "senior",
    // The craft bonus is mostly capped away; what sets the Senior apart is
    // that a bad roll or a rejected PR does not cost the ground it would.
    effects: {
      craftSuccessPoints: 10,
      conflictResistancePoints: 6,
      aiSuccessPoints: -4,
      rerollFailedRoll: true,
      counterPrRejection: true,
    },
    startingSkills: [],
    startingTree: {},
    unlockCost: 300,
    ally: "fenwick",
    rival: "quorum",
  },
  vibe_coder: {
    id: "vibe_coder",
    // Fast and confident, and the debt gauge is a rumour. No free skill to
    // start with: with one, it outlived every other starter by far.
    effects: { aiSuccessPoints: 15, craftSuccessPoints: -6, debtFuzzBonus: 10 },
    startingSkills: [],
    startingTree: {},
    unlockCost: 600,
    ally: "volute",
    rival: "lisiere",
  },
  devops: {
    id: "devops",
    // Trusts the machine because a machine checks it: CI, and a pipeline
    // that reviews its commits for free every few turns.
    effects: { freeReviewEvery: 1 },
    startingSkills: [],
    startingTree: { ci: 1 },
    unlockCost: 1000,
    ally: "sept",
    rival: "ostium",
  },
};

export function isProfileId(value: string): value is ProfileId {
  return Object.hasOwn(PROFILES, value);
}
