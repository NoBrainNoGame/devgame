import { z } from "zod";

import { freeFeatureSkills, PROFILE_IDS, SKILL_IDS } from "@/game/content";

/**
 * Meta-progression: what survives a run. It lives in `localStorage` while
 * signed out and mirrors to `Profile` when signed in, validated by this one
 * schema on both sides.
 */

export const SettingsSchema = z.object({
  sound: z.boolean().default(true),
  reducedMotion: z.boolean().default(false),
});

export const MetaProgressSchema = z.object({
  version: z.number().int().positive(),
  level: z.number().int().min(1).max(999),
  xp: z.number().int().min(0),
  /** Currency for unlocks. Spent, so it is not the same as `totalCommits`. */
  commitsBank: z.number().int().min(0),
  totalCommits: z.number().int().min(0),
  // Defaulted, not required: a meta saved before tickets existed must still
  // parse, or the player loses level and unlocks to a missing key.
  ticketsDelivered: z.number().int().min(0).default(0),
  unlockedProfiles: z.array(z.enum(PROFILE_IDS)).max(PROFILE_IDS.length),
  unlockedSkills: z.array(z.enum(SKILL_IDS)).max(SKILL_IDS.length),
  settings: SettingsSchema,
  /** Optimistic lock shared with the `Profile` row. */
  metaVersion: z.number().int().min(0),
  updatedAt: z.iso.datetime(),
});

export type SettingsDto = z.infer<typeof SettingsSchema>;
export type MetaProgressDto = z.infer<typeof MetaProgressSchema>;

export const META_VERSION = 1;

/** A brand new player: the Junior, six starter skills, nothing else. */
export function emptyMeta(now: string): MetaProgressDto {
  return {
    version: META_VERSION,
    level: 1,
    xp: 0,
    commitsBank: 0,
    totalCommits: 0,
    ticketsDelivered: 0,
    unlockedProfiles: ["junior"],
    unlockedSkills: freeFeatureSkills(),
    settings: { sound: true, reducedMotion: false },
    metaVersion: 0,
    updatedAt: now,
  };
}
