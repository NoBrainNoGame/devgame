import { getTranslations } from "next-intl/server";

import { emptyMeta } from "@/game";

import { PlayClient } from "./PlayClient";

/**
 * Reads the session and hands the client everything a run needs. It is dynamic
 * because it will read the player's profile; the canvas itself never renders on
 * the server.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("play");
  return { title: t("title") };
}

export default async function PlayPage() {
  const meta = emptyMeta(new Date().toISOString());

  return (
    <PlayClient
      meta={meta}
      seed={Math.floor(Math.random() * 0xffffffff).toString(16)}
      mode="classic"
      profileId="junior"
    />
  );
}
