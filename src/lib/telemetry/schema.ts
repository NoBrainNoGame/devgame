import { z } from "zod";

import { RunSaveSchema } from "@/game";
import { routing } from "@/i18n/routing";

/**
 * What the game sends about a run, for balancing. A save — a seed and the
 * decisions — with the moment it was taken and two facts only the browser
 * knows: how long the tab has been on it, and how the idle clock was set.
 * No number about the run itself: the server replays the save and computes
 * every one of those.
 */
export const SampleKindSchema = z.enum(["final", "checkpoint", "abandoned"]);

export const RunSampleInputSchema = z.object({
  save: RunSaveSchema,
  kind: SampleKindSchema,
  locale: z.enum(routing.locales),
  sessionMs: z.number().int().min(0).max(1_000_000_000),
  idle: z.object({
    enabled: z.boolean(),
    speed: z.union([z.literal(1), z.literal(10), z.literal(100)]),
  }),
});

export type RunSampleInput = z.infer<typeof RunSampleInputSchema>;

/** Sprints between two checkpoints of a run still going. */
export const CHECKPOINT_EVERY_SPRINTS = 10;
