import "@/lib/server-only";

import { prisma } from "@/lib/db";

/**
 * The name a new profile starts with: the account's name, else the local part
 * of its address, else "dev". The player can change it on the profile page.
 *
 * Outside `actions.ts` on purpose: everything a `"use server"` module exports
 * becomes an action a browser can call, and this one is not meant to be.
 */
export async function defaultDisplayName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  for (const candidate of [user?.name, user?.email?.split("@")[0]]) {
    const trimmed = candidate?.trim() ?? "";
    if (trimmed.length >= 2) return trimmed.slice(0, 24);
  }

  return "dev";
}
