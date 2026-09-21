import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { env } from "@/lib/env";
import { alternatesFor } from "@/lib/seo";

import { type FieldRow, Fields, isPlaceholder, P, Section } from "../prose";

/** The identity of the publisher, in the order article 6 III of the LCEN asks for it. */
const PUBLISHER_FIELDS = [
  "name",
  "status",
  "capital",
  "address",
  "siren",
  "vat",
  "director",
  "email",
] as const;

const HOST_FIELDS = ["hostName", "hostAddress", "hostContact"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("legal.notice")]);

  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(env.APP_URL, locale, "/legal/mentions-legales"),
    robots: { index: true, follow: true },
  };
}

export default async function LegalNoticePage(): Promise<React.JSX.Element> {
  const [t, common, fields, publisher] = await Promise.all([
    getTranslations("legal.notice"),
    getTranslations("legal.common"),
    getTranslations("legal.fields"),
    getTranslations("legal.publisher"),
  ]);

  const publisherRows: FieldRow[] = PUBLISHER_FIELDS.map((key) => ({
    label: fields(key),
    value: publisher(key),
  }));
  const hostRows: FieldRow[] = HOST_FIELDS.map((key) => ({
    label: fields(key),
    value: publisher(key),
  }));

  // The banner is the last thing standing between a placeholder and production,
  // so it is driven by the values actually rendered below rather than by a flag
  // somebody has to remember to flip.
  const incomplete = [...publisherRows, ...hostRows].some((row) => isPlaceholder(row.value));

  return (
    <article>
      <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground text-xs">{common("updated")}</p>

      {incomplete ? (
        <aside className="mt-6 border border-branch-hotfix/40 bg-panel p-4 text-xs leading-relaxed">
          <p className="font-semibold text-branch-hotfix">{common("todoTitle")}</p>
          <p className="mt-2 text-muted-foreground">{common("todoBody")}</p>
          <p className="mt-2 text-muted-foreground">{common("todoNote")}</p>
        </aside>
      ) : null}

      <Section title={t("publisherTitle")}>
        <P>{t("publisherIntro")}</P>
        <Fields rows={publisherRows} placeholderLabel={common("placeholderLabel")} />
      </Section>

      <Section title={t("hostTitle")}>
        <P>{t("hostIntro")}</P>
        <Fields rows={hostRows} placeholderLabel={common("placeholderLabel")} />
      </Section>

      <Section title={t("ipTitle")}>
        <P>{t("ipP1")}</P>
        <P>{t("ipP2")}</P>
      </Section>

      <Section title={t("reportTitle")}>
        <P>{t("reportP1")}</P>
      </Section>
    </article>
  );
}
