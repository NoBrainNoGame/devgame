import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { isGoogleEnabled } from "@/lib/auth";
import { env } from "@/lib/env";
import { alternatesFor } from "@/lib/seo";
import { getSession } from "@/lib/session";

import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("login")]);

  return {
    title: t("title"),
    alternates: alternatesFor(env.APP_URL, locale, "/login"),
    robots: { index: false, follow: true },
  };
}

export default async function LoginPage(): Promise<React.JSX.Element> {
  // Offline there is no account to have: the page does not exist here.
  if (!env.ONLINE) notFound();

  const [locale, session] = await Promise.all([getLocale(), getSession()]);
  if (session !== null) redirect({ href: "/profile", locale });

  const t = await getTranslations("login");

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12 sm:py-16">
      <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground text-sm">{t("subtitle")}</p>

      <div className="mt-8">
        {/* The locale prefix is written in by hand: Better Auth builds the
            callback URL itself and knows nothing about `@/i18n/navigation`. */}
        <LoginForm
          callbackUrl={`/${locale}/play`}
          googleEnabled={isGoogleEnabled}
          showDevHint={env.NODE_ENV === "development"}
        />
      </div>
    </div>
  );
}
