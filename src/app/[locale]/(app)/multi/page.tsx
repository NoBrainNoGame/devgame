import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { env } from "@/lib/env";
import { alternatesFor } from "@/lib/seo";
import { getSession } from "@/lib/session";

import { Lobby } from "./Lobby";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("multi")]);
  return {
    title: t("title"),
    alternates: alternatesFor(env.APP_URL, locale, "/multi"),
    robots: { index: false, follow: false },
  };
}

export default async function MultiPage(): Promise<React.JSX.Element> {
  const session = await getSession();
  return <Lobby userName={session?.user.name ?? ""} />;
}
