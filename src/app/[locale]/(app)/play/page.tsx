import { getTranslations } from "next-intl/server";

import { type RunSaveDto, RunSaveSchema } from "@/game";
import { getDailySeed } from "@/lib/daily/store";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getMyProfile } from "@/lib/profile/actions";
import { getSession } from "@/lib/session";

import { PlayClient } from "./PlayClient";

/**
 * Hands the client everything a run needs and nothing it does not: the
 * account's progress, today's shared seed, and whatever run the server thinks
 * is still open.
 *
 * Dynamic because every one of those reads the session. The canvas itself never
 * renders on the server.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("play");
  return { title: t("title") };
}

export default async function PlayPage() {
  const session = await getSession();
  const userId = session?.user.id ?? null;
  const signedIn = userId !== null;

  const [profile, daily, serverRun] = await Promise.all([
    signedIn ? getMyProfile() : null,
    // A board that cannot reach the database should still let people play the
    // classic mode, so a failure here disables the daily rather than the page.
    getDailySeed().catch(() => null),
    signedIn ? findOpenRun(userId) : null,
  ]);

  return (
    <PlayClient
      online={env.ONLINE}
      signedIn={signedIn}
      userName={session?.user.name ?? null}
      serverMeta={profile?.ok === true && profile.data !== null ? profile.data.meta : null}
      dailySeed={daily?.seed ?? null}
      serverRun={serverRun}
    />
  );
}

/** The run the server still has open, if it parses. */
async function findOpenRun(userId: string): Promise<RunSaveDto | null> {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (profile === null) return null;

  const run = await prisma.run.findFirst({
    where: { profileId: profile.id, status: "in_progress" },
    orderBy: { updatedAt: "desc" },
  });
  if (run === null) return null;

  // The row stores the save verbatim, so this is a validation rather than a
  // reconstruction. A save the current build cannot parse is one the client
  // should not be handed: it would resume into a game that never happened.
  const parsed = RunSaveSchema.safeParse(run.save);
  return parsed.success ? parsed.data : null;
}
