import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { env } from "@/lib/env";
import { alternatesFor } from "@/lib/seo";

import { Bullets, P, Section } from "../prose";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("legal.terms")]);

  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(env.APP_URL, locale, "/legal/conditions"),
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage(): Promise<React.JSX.Element> {
  const [t, common] = await Promise.all([
    getTranslations("legal.terms"),
    getTranslations("legal.common"),
  ]);

  return (
    <article>
      <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground text-xs">{common("updated")}</p>

      <Section title={t("serviceTitle")}>
        <P>{t("serviceP1")}</P>
        <P>{t("serviceP2")}</P>
      </Section>

      <Section title={t("freeTitle")}>
        <P>{t("freeP1")}</P>
        <P>{t("freeP2")}</P>
        <P>{t("freeP3")}</P>
      </Section>

      <Section title={t("accountTitle")}>
        <Bullets items={[t("accountI1"), t("accountI2"), t("accountI3"), t("accountI4")]} />
      </Section>

      <Section title={t("fairPlayTitle")}>
        <P>{t("fairPlayP1")}</P>
        <Bullets items={[t("fairPlayI1"), t("fairPlayI2"), t("fairPlayI3"), t("fairPlayI4")]} />
      </Section>

      <Section title={t("moderationTitle")}>
        <P>{t("moderationP1")}</P>
        <P>{t("moderationP2")}</P>
      </Section>

      <Section title={t("ipTitle")}>
        <P>{t("ipP1")}</P>
        <P>{t("ipP2")}</P>
      </Section>

      <Section title={t("liabilityTitle")}>
        <P>{t("liabilityP1")}</P>
        <P>{t("liabilityP2")}</P>
      </Section>

      <Section title={t("dataTitle")}>
        <P>{t("dataP1")}</P>
      </Section>

      <Section title={t("lawTitle")}>
        <P>{t("lawP1")}</P>
      </Section>

      <Section title={t("changesTitle")}>
        <P>{t("changesP1")}</P>
      </Section>
    </article>
  );
}
