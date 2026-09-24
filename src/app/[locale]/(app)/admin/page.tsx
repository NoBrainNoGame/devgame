import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { env } from "@/lib/env";

/**
 * The local admin panel, inside the site.
 *
 * The panel is its own server (`bun run admin`), bound to the loopback
 * address and behind its own password; this page only frames it, so it can
 * be reached from the header while developing. It exists in development
 * only: anywhere else the route is a 404, whatever the header shows — the
 * check is here, not in the button (boundary 3).
 *
 * Framed as `localhost` rather than `127.0.0.1` on purpose: the panel's
 * session cookie is `SameSite=Strict`, and a frame is only same-site with
 * the page around it when both are `localhost`.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("admin"), robots: { index: false, follow: false } };
}

export default async function AdminPage(): Promise<React.JSX.Element> {
  if (env.NODE_ENV !== "development") notFound();
  const t = await getTranslations("nav");

  return (
    <iframe
      src={`http://localhost:${env.ADMIN_PORT}/`}
      title={t("admin")}
      className="size-full border-0 bg-bg"
    />
  );
}
