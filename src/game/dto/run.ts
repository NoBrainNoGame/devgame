import { z } from "zod";

import {
  DEV_RANKS,
  PROFILE_IDS,
  RELIC_IDS,
  SKILL_IDS,
  TREE_IDS,
  UPGRADE_IDS,
} from "@/game/content";

/**
 * What crosses the wire, and what sits in `localStorage`.
 *
 * Note what is absent: a score. The client never states one. `submitRun`
 * replays the action log and writes what the engine computed, so a tampered
 * save can only produce a game that does not happen, never a better result.
 */

/** Upper bound on a single run, so a replay can never be made to run forever. */
export const MAX_ACTIONS = 5000;

const TicketIdSchema = z.string().regex(/^t\d+$/);

const DetourKindSchema = z.enum(["refactor", "fix", "risky", "squash", "docs", "rebase"]);

export const PlayerActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), ticketId: TicketIdSchema }),
  z.object({ type: z.literal("checkout"), ticketId: TicketIdSchema }),
  z.object({
    type: z.literal("commit"),
    mode: z.enum(["craft", "ai"]),
    kind: DetourKindSchema.optional(),
  }),
  z.object({ type: z.literal("review") }),
  z.object({ type: z.literal("rest") }),
  z.object({ type: z.literal("submit") }),
  z.object({ type: z.literal("merge") }),
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("tree"), id: z.enum(TREE_IDS) }),
  z.object({ type: z.literal("buy"), id: z.enum(UPGRADE_IDS) }),
  z.object({ type: z.literal("buy_point") }),
  z.object({ type: z.literal("hire"), rank: z.enum(DEV_RANKS) }),
  z.object({ type: z.literal("resolve_conflict"), how: z.enum(["manual", "ai"]) }),
  z.object({ type: z.literal("choose_relic"), relicId: z.enum(RELIC_IDS) }),
]);

export const RunModeSchema = z.enum(["classic", "daily"]);

export const RunSaveSchema = z.object({
  /** Save shape. Migrations key off this. */
  version: z.number().int().positive(),
  /** Rules fingerprint the run was played against. */
  rules: z.string().min(1).max(16),
  seed: z.string().min(1).max(64),
  mode: RunModeSchema,
  profileId: z.enum(PROFILE_IDS),
  /** Account unlocks in force at the time, since they shape the map. */
  unlockedSkills: z.array(z.enum(SKILL_IDS)).max(SKILL_IDS.length),
  /** Skill points the account's level granted at the start. Checked against the account. */
  startingSkillPoints: z.number().int().min(0).max(999),
  actions: z.array(PlayerActionSchema).max(MAX_ACTIONS),
  /** Generated once when the run starts; makes submission idempotent. */
  clientRunId: z.uuid(),
  createdAt: z.iso.datetime(),
});

export type PlayerActionDto = z.infer<typeof PlayerActionSchema>;
export type RunSaveDto = z.infer<typeof RunSaveSchema>;
