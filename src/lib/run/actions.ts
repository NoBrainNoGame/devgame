"use server";

import "@/lib/server-only";

import { revalidatePath } from "next/cache";

import {
  isCurrentRules,
  RULES_FINGERPRINT,
  type RunSaveDto,
  RunSaveSchema,
  replayRun,
} from "@/game";
import { type ActionResult, fail, guard, ok } from "@/lib/actions/result";
import { utcDate } from "@/lib/daily/seed";
import { getDailySeed } from "@/lib/daily/store";
import { prisma } from "@/lib/db";
import { applyRunToMeta } from "@/lib/profile/progression";
import { toColumns, toMeta } from "@/lib/profile/row";
import { hit, LIMITS } from "@/lib/rate-limit";
import { getCurrentUserId } from "@/lib/session";

/**
 * Storing and scoring runs.
 *
 * The rule that shapes everything here: **the client never states a score**.
 * The save it sends is a seed and an ordered list of decisions, and the server
 * plays that list through the same engine to find out what happened. A forged
 * log either reaches a different game or hits a move that was never legal, and
 * is refused either way.
 *
 * On cost: the longest run the engine produces is a few hundred actions and
 * replays in about a tenth of a second, because burnout and the rivals end a
 * run long before the schema's 5000-action ceiling. Nothing lets a player stall
 * indefinitely — the free moves are bounded by the graph and by the finite
 * DevOps tree — so that ceiling is a belt-and-braces bound rather than the real
 * one. If replay ever shows up in a profile, cap it by wall clock instead of by
 * action count.
 */

export interface SubmitResult {
  runId: string;
  score: number;
  sprints: number;
  botsFired: number;
  commits: number;
}

/**
 * Keeps the run in progress so a reload, or another machine, can pick it up.
 * Not scored and not ranked — it is a bookmark.
 */
export async function saveRun(input: unknown): Promise<ActionResult<{ runId: string }>> {
  return guard(async () => {
    const userId = await getCurrentUserId();
    if (userId === null) return fail("unauthorized", "Sign in first");

    const parsed = RunSaveSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid", "That save is malformed", parsed.error.issues);
    }

    if (!hit(`saveRun:${userId}`, LIMITS.saveRun).allowed) {
      return fail("rate-limited", "Too many saves");
    }

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (profile === null) return fail("rejected", "Sync your progress first");

    const save = parsed.data;

    const existing = await prisma.run.findUnique({ where: { clientRunId: save.clientRunId } });
    if (existing !== null) {
      if (existing.profileId !== profile.id) return fail("rejected", "That run belongs elsewhere");
      // A finished run is immutable: overwriting it would let a player keep
      // playing after submitting a score.
      if (existing.status !== "in_progress") return ok({ runId: existing.id });

      const updated = await prisma.run.update({
        where: { id: existing.id },
        data: { save, commits: save.actions.length },
      });
      return ok({ runId: updated.id });
    }

    // One in-progress run per mode; the older one is abandoned rather than
    // deleted, so it stays visible in the player's history.
    await prisma.run.updateMany({
      where: { profileId: profile.id, mode: save.mode, status: "in_progress" },
      data: { status: "abandoned" },
    });

    const created = await prisma.run.create({
      data: {
        profileId: profile.id,
        mode: save.mode,
        seed: save.seed,
        ...(save.mode === "daily" ? { dailyDate: dayOf(save.createdAt) } : {}),
        version: save.version,
        save,
        commits: save.actions.length,
        clientRunId: save.clientRunId,
      },
    });

    return ok({ runId: created.id });
  });
}

/**
 * Finishes a run: replay it, score it, rank it.
 *
 * Idempotent on `clientRunId`, because a player who loses their connection on
 * the submit button will press it again.
 */
export async function submitRun(input: unknown): Promise<ActionResult<SubmitResult>> {
  return guard(async () => {
    const userId = await getCurrentUserId();
    if (userId === null) return fail("unauthorized", "Sign in first");

    const parsed = RunSaveSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid", "That save is malformed", parsed.error.issues);
    }

    if (!hit(`submitRun:${userId}`, LIMITS.submitRun).allowed) {
      return fail("rate-limited", "Too many submissions");
    }

    const save = parsed.data;

    // Rules that have since changed cannot be compared with today's runs. The
    // save still loads locally and still shows its score; it just does not rank.
    if (!isCurrentRules(save)) {
      return fail("rejected", `This run was played against older rules (${RULES_FINGERPRINT})`);
    }

    if (save.mode === "daily") {
      const daily = await getDailySeed();
      if (save.seed !== daily.seed) {
        return fail("rejected", "The daily changed at midnight UTC");
      }
    }

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (profile === null) return fail("rejected", "Sync your progress first");

    const existing = await prisma.run.findUnique({ where: { clientRunId: save.clientRunId } });
    if (existing !== null && existing.status === "finished") {
      return ok({
        runId: existing.id,
        score: existing.score,
        sprints: existing.sprintsCompleted,
        botsFired: existing.botsFired,
        commits: existing.commits,
      });
    }
    if (existing !== null && existing.profileId !== profile.id) {
      return fail("rejected", "That run belongs elsewhere");
    }

    const outcome = replayRun(save);
    if (!outcome.valid) {
      await markRejected(save, profile.id);
      return fail("rejected", `The run does not replay: ${outcome.error}`);
    }
    if (!outcome.finished) {
      return fail("rejected", "That run has not ended yet");
    }

    const data = {
      profileId: profile.id,
      mode: save.mode,
      seed: save.seed,
      ...(save.mode === "daily" ? { dailyDate: dayOf(save.createdAt) } : {}),
      status: "finished" as const,
      version: save.version,
      save,
      score: outcome.score,
      sprintsCompleted: outcome.stats.sprints,
      botsFired: outcome.stats.botsFired,
      commits: outcome.stats.commits,
      clientRunId: save.clientRunId,
      finishedAt: new Date(),
    };

    const run = await prisma.run.upsert({
      where: { clientRunId: save.clientRunId },
      create: data,
      update: data,
    });

    // Progression is awarded from the replay, through the same pure function
    // the client used to show the result. Awarding it here rather than trusting
    // a later `syncMeta` is what makes XP and unlocks survive a player who
    // closes the tab on the score screen.
    //
    // Running exactly once per run is guaranteed by the early return above: a
    // run already marked finished never reaches this point.
    const reward = applyRunToMeta(
      toMeta(profile),
      {
        xp: outcome.stats.xp,
        commits: outcome.stats.commits,
        botsFired: outcome.stats.botsFired,
        sprints: outcome.stats.sprints,
      },
      new Date().toISOString(),
    );

    await prisma.profile.update({
      where: { id: profile.id },
      data: { ...toColumns(reward.meta), metaVersion: { increment: 1 } },
    });

    revalidatePath("/[locale]/leaderboard", "page");
    revalidatePath("/[locale]/profile", "page");

    return ok({
      runId: run.id,
      score: run.score,
      sprints: run.sprintsCompleted,
      botsFired: run.botsFired,
      commits: run.commits,
    });
  });
}

/**
 * A log that does not replay is kept, marked. It is the only evidence of what
 * was sent, and the row is small.
 */
async function markRejected(save: RunSaveDto, profileId: string): Promise<void> {
  await prisma.run.upsert({
    where: { clientRunId: save.clientRunId },
    create: {
      profileId,
      mode: save.mode,
      seed: save.seed,
      status: "rejected",
      version: save.version,
      save,
      clientRunId: save.clientRunId,
    },
    update: { status: "rejected" },
  });
}

function dayOf(iso: string): Date {
  return new Date(`${utcDate(new Date(iso))}T00:00:00.000Z`);
}
