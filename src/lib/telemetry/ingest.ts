import "@/lib/server-only";

import { type RunSummary, replayRun, summariseRun } from "@/game";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { RunSampleInput } from "@/lib/telemetry/schema";

/**
 * Turns a sample into a row: replays the save, summarises the state the
 * rules reached, stores both. A save the rules refuse is dropped — a forged
 * log would poison the numbers, and a checkpoint of a run still going is
 * only ever valid if its log is. One row per run, kind and sprint.
 */
export async function ingestSample(input: RunSampleInput): Promise<RunSummary | null> {
  const replay = replayRun(input.save);
  if (!replay.valid) return null;
  if (input.kind === "final" && !replay.finished) return null;
  if (input.kind !== "final" && replay.finished) return null;

  const summary = summariseRun(replay.state);
  await prisma.runSample.upsert({
    where: {
      clientRunId_kind_sprint: {
        clientRunId: input.save.clientRunId,
        kind: input.kind,
        sprint: summary.sprints,
      },
    },
    create: {
      clientRunId: input.save.clientRunId,
      kind: input.kind,
      sprint: summary.sprints,
      rules: input.save.rules,
      locale: input.locale,
      // Both are plain JSON already; Prisma's input type just cannot see it.
      save: input.save as Prisma.InputJsonValue,
      summary: summary as unknown as Prisma.InputJsonValue,
      sessionMs: input.sessionMs,
      idle: input.idle,
    },
    update: {},
  });
  return summary;
}
