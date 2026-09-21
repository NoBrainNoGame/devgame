import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { GitGraph } from "@/components/landing/GitGraph";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";
import { alternatesFor, siteUrl } from "@/lib/seo";

/**
 * The landing page.
 *
 * It has one job: make someone who has never heard of this understand the
 * central choice — write it yourself, or let the machine write it — and press
 * play. Everything on the page earns its place against that, which is why
 * there is no feature grid and no screenshot carousel.
 *
 * Static: nothing here reads the session or the database, so it can be cached
 * and served fast, which is also the single biggest thing search ranking cares
 * about that is within our control.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("landing");

  return {
    title: { absolute: `${t("title")} — ${t("tagline")}` },
    description: t("metaDescription"),
    alternates: alternatesFor(env.APP_URL, locale),
    openGraph: {
      type: "website",
      title: `${t("title")} — ${t("tagline")}`,
      description: t("metaDescription"),
      url: siteUrl(env.APP_URL, locale),
    },
  };
}

const HOW_IT_WORKS = ["howItWorks1", "howItWorks2", "howItWorks3"] as const;
const PILLARS = ["pillarCraft", "pillarAi", "pillarBots"] as const;

export default async function HomePage(): Promise<React.JSX.Element> {
  const locale = await getLocale();
  const t = await getTranslations("landing");

  return (
    <>
      <StructuredData
        name={t("title")}
        description={t("metaDescription")}
        url={siteUrl(env.APP_URL, locale)}
        locale={locale}
      />

      <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        {/* Hero ------------------------------------------------------------ */}
        <section className="grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <div>
            <p className="font-medium text-branch-feature text-xs uppercase tracking-[0.2em]">
              {t("eyebrow")}
            </p>

            <h1 className="mt-4 text-balance font-semibold text-4xl leading-[1.1] tracking-tight sm:text-5xl">
              {t("headline")}
            </h1>

            <p className="mt-5 max-w-prose text-pretty text-muted-foreground leading-relaxed">
              {t("pitch")}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/play">{t("cta")}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/leaderboard">{t("ctaSecondary")}</Link>
              </Button>
            </div>

            <p className="mt-4 text-muted-foreground text-xs">{t("ctaNote")}</p>
          </div>

          <GitGraph className="mx-auto w-full max-w-[280px] lg:max-w-none" />
        </section>

        {/* The three ideas the game rests on -------------------------------- */}
        <section className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {PILLARS.map((key) => (
            <article key={key} className="bg-panel/60 p-5">
              <h2 className="font-medium text-sm">{t(`${key}Title`)}</h2>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{t(key)}</p>
            </article>
          ))}
        </section>

        {/* How a run goes --------------------------------------------------- */}
        <section className="mt-16">
          <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.2em]">
            {t("howItWorksTitle")}
          </h2>

          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((key, index) => (
              <li key={key} className="border-line border-t pt-4">
                <span className="text-branch-feature text-xs tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{t(key)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Daily seed ------------------------------------------------------- */}
        <section className="mt-16 rounded-lg border border-line bg-panel/40 p-6 sm:p-8">
          <h2 className="font-medium text-base">{t("dailyTitle")}</h2>
          <p className="mt-2 max-w-prose text-muted-foreground text-sm leading-relaxed">
            {t("dailySeed")}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-5">
            <Link href={{ pathname: "/leaderboard", query: { mode: "daily" } }}>
              {t("dailyCta")}
            </Link>
          </Button>
        </section>

        {/* Open about what it is -------------------------------------------- */}
        <section className="mt-16 border-line border-t pt-8">
          <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-[0.2em]">
            {t("honestTitle")}
          </h2>
          <p className="mt-4 max-w-prose text-muted-foreground text-sm leading-relaxed">
            {t("honest")}
          </p>
        </section>
      </div>
    </>
  );
}

/**
 * Schema.org data, so a search engine can tell this is a game rather than a
 * developer-tools landing page — the wording alone is genuinely ambiguous.
 *
 * Only claims that are true and checkable go in here. Ratings and review counts
 * are the fields people fabricate; they are absent.
 */
function StructuredData({
  name,
  description,
  url,
  locale,
}: {
  name: string;
  description: string;
  url: string;
  locale: string;
}): React.JSX.Element {
  const data = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name,
    description,
    url,
    inLanguage: locale,
    applicationCategory: "Game",
    gamePlatform: "Web browser",
    playMode: "SinglePlayer",
    genre: ["Roguelike", "Strategy"],
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };

  // JSON-LD has to be injected as raw text: it is not HTML, and React would
  // escape it into something no crawler can parse. The value is built here from
  // our own strings, so there is nothing user-supplied to inject.
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: see above
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
