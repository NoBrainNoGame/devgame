"use server";

import "@/lib/server-only";

import { emptyMeta, type MetaProgressDto, MetaProgressSchema } from "@/game";
import { type ActionResult, fail, guard, ok } from "@/lib/actions/result";
import { prisma } from "@/lib/db";
import { mergeMeta } from "@/lib/profile/merge";
import { toColumns, toMeta } from "@/lib/profile/row";
import { hit, LIMITS } from "@/lib/rate-limit";
import { getCurrentUserId } from "@/lib/session";

/**
 * The player's account-level progress.
 *
 * Everything here is a mirror of what already works in `localStorage`; the
 * server exists so the progress follows the player to another machine, and so
 * the leaderboard has something to attach a name to.
 */

export interface ProfileView {
  displayName: string;
  meta: MetaProgressDto;
}

export async function getMyProfile(): Promise<ActionResult<ProfileView | null>> {
  return guard(async () => {
    const userId = await getCurrentUserId();
    if (userId === null) return fail("unauthorized", "Sign in first");

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (profile === null) return ok(null);

    return ok({ displayName: profile.displayName, meta: toMeta(profile) });
  });
}

/**
 * Pushes local progress up, merging it with whatever is already there.
 *
 * The merge runs on both sides deliberately. The client merges so it can show
 * the result immediately; the server merges again because it cannot trust that
 * the client did, and because another device may have written in between.
 *
 * `metaVersion` is an optimistic lock. A mismatch is not an error — it means
 * somebody else got there first — so the server copy comes back and the client
 * merges once more.
 */
export async function syncMeta(input: unknown): Promise<ActionResult<MetaProgressDto>> {
  return guard(async () => {
    const userId = await getCurrentUserId();
    if (userId === null) return fail("unauthorized", "Sign in first");

    const parsed = MetaProgressSchema.safeParse(input);
    if (!parsed.success) {
      return fail("invalid", "That save does not look like progress", parsed.error.issues);
    }

    if (!hit(`syncMeta:${userId}`, LIMITS.syncMeta).allowed) {
      return fail("rate-limited", "Too many sync attempts");
    }

    const incoming = parsed.data;
    const existing = await prisma.profile.findUnique({ where: { userId } });

    if (existing === null) {
      const created = await prisma.profile.create({
        data: {
          userId,
          displayName: await defaultDisplayName(userId),
          ...toColumns(incoming),
          metaVersion: 1,
        },
      });
      return ok(toMeta(created));
    }

    const merged = mergeMeta(toMeta(existing), incoming);

    const updated = await prisma.profile.updateMany({
      where: { userId, metaVersion: incoming.metaVersion },
      data: { ...toColumns(merged), metaVersion: { increment: 1 } },
    });

    if (updated.count === 0) {
      // Somebody wrote between the client's read and this call. Hand back what
      // is actually stored so the client can merge again and retry once.
      const current = await prisma.profile.findUnique({ where: { userId } });
      return current === null
        ? fail("internal", "The profile disappeared mid-write")
        : fail("conflict", "This profile changed on another device");
    }

    const after = await prisma.profile.findUnique({ where: { userId } });
    return after === null
      ? fail("internal", "The profile disappeared mid-write")
      : ok(toMeta(after));
  });
}

/** Renaming yourself. The only field a player controls directly. */
export async function setDisplayName(name: unknown): Promise<ActionResult<string>> {
  return guard(async () => {
    const userId = await getCurrentUserId();
    if (userId === null) return fail("unauthorized", "Sign in first");

    if (typeof name !== "string") return fail("invalid", "A name has to be text");

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      return fail("invalid", "A name is between 2 and 24 characters");
    }

    await prisma.profile.update({ where: { userId }, data: { displayName: trimmed } });
    return ok(trimmed);
  });
}

/**
 * A name to start from. The player can change it on their profile page.
 *
 * Blank is not the same as absent: a magic-link signup leaves `name` as an
 * empty string, which `??` happily accepts and which made every player "dev".
 */
async function defaultDisplayName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  for (const candidate of [user?.name, user?.email?.split("@")[0]]) {
    const trimmed = candidate?.trim() ?? "";
    if (trimmed.length >= 2) return trimmed.slice(0, 24);
  }

  return "dev";
}
