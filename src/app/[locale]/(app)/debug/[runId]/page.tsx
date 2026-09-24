import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { RunSaveSchema } from "@/game";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

import { RunDebugger } from "./RunDebugger";

/**
 * A saved run, replayed one action at a time.
 *
 * The admin panel links here from a run. The page reads the save the player
 * left on the server, hands it to the stage, and the stage steps through it:
 * forward with the animations, back by replaying from the start, anywhere
 * by the slider. Development only — anywhere else the route is a 404,
 * whatever links to it — and the save is read as untrusted, through the
 * same schema as everything else.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("debug");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function DebugPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<React.JSX.Element> {
  if (env.NODE_ENV !== "development") notFound();
  const { runId } = await params;

  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      save: true,
      status: true,
      updatedAt: true,
      profile: { select: { displayName: true, user: { select: { name: true, email: true } } } },
    },
  });
  if (run === null) notFound();
  const save = RunSaveSchema.safeParse(run.save);
  if (!save.success) notFound();

  const owner = run.profile.displayName ?? run.profile.user.name ?? run.profile.user.email;
  return (
    <RunDebugger
      save={save.data}
      owner={owner}
      status={run.status}
      savedAt={run.updatedAt.toISOString()}
    />
  );
}
