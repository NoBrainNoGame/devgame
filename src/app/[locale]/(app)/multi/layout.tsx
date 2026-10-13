import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { RealtimeConnection } from "@/components/multi/connection";
import { redirect } from "@/i18n/navigation";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

/**
 * The gate to multiplayer, checked here and again by the ticket route: a
 * hidden link protects nothing. Off, it is a 404 as if the page did not
 * exist; signed out, the login page comes first, like the bug report. Once
 * past, one connection is held for both screens below.
 */
export default async function MultiLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  if (!env.MULTI) notFound();
  const locale = await getLocale();
  (await getSession()) ?? redirect({ href: "/login", locale });
  return <RealtimeConnection>{children}</RealtimeConnection>;
}
