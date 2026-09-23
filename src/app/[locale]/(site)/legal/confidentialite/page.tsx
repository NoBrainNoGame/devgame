import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { env } from "@/lib/env";
import { alternatesFor } from "@/lib/seo";

import { Bullets, type FieldRow, Fields, P, Section } from "../prose";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("legal.privacy")]);

  return {
    title: t("title"),
    description: t("description"),
    alternates: alternatesFor(env.APP_URL, locale, "/legal/confidentialite"),
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage(): Promise<React.JSX.Element> {
  const [t, common, fields, publisher] = await Promise.all([
    getTranslations("legal.privacy"),
    getTranslations("legal.common"),
    getTranslations("legal.fields"),
    getTranslations("legal.publisher"),
  ]);

  const placeholderLabel = common("placeholderLabel");
  const contactRows: FieldRow[] = [{ label: fields("email"), value: publisher("email") }];
  const processorRows: FieldRow[] = [
    { label: fields("hostName"), value: publisher("hostName") },
    { label: fields("emailProvider"), value: publisher("emailProvider") },
  ];

  return (
    <article>
      <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground text-xs">{common("updated")}</p>

      <Section title={t("summaryTitle")}>
        <Bullets items={[t("summaryI1"), t("summaryI2"), t("summaryI3"), t("summaryI4")]} />
      </Section>

      <Section title={t("controllerTitle")}>
        <P>{t("controllerP1")}</P>
        <Fields rows={contactRows} placeholderLabel={placeholderLabel} />
      </Section>

      <Section title={t("offlineTitle")}>
        <P>{t("offlineP1")}</P>
        <P>{t("offlineP2")}</P>
      </Section>

      <Section title={t("accountTitle")}>
        <P>{t("accountP1")}</P>
        <Bullets items={[t("accountI1"), t("accountI2"), t("accountI3"), t("accountI4")]} />
        <P>{t("accountP2")}</P>
      </Section>

      <Section title={t("gameTitle")}>
        <P>{t("gameP1")}</P>
        <P>{t("gameP2")}</P>
        <P>{t("gameP3")}</P>
      </Section>

      <Section title={t("publicTitle")}>
        <P>{t("publicP1")}</P>
        <P>{t("publicP2")}</P>
      </Section>

      <Section title={t("audienceTitle")}>
        <P>{t("audienceP1")}</P>
        <P>{t("audienceP2")}</P>
      </Section>

      <Section title={t("reportsTitle")}>
        <P>{t("reportsP1")}</P>
      </Section>

      <Section title={t("cookiesTitle")}>
        <P>{t("cookiesP1")}</P>
        <P>{t("cookiesP2")}</P>
      </Section>

      <Section title={t("thirdPartyTitle")}>
        <P>{t("thirdPartyP1")}</P>
        <Bullets items={[t("thirdPartyI1"), t("thirdPartyI2"), t("thirdPartyI3")]} />
        <Fields rows={processorRows} placeholderLabel={placeholderLabel} />
        <P>{t("thirdPartyP2")}</P>
      </Section>

      <Section title={t("retentionTitle")}>
        <P>{t("retentionP1")}</P>
        <P>{t("retentionP2")}</P>
      </Section>

      <Section title={t("rightsTitle")}>
        <P>{t("rightsP1")}</P>
        <P>{t("rightsP2")}</P>
        <P>{t("rightsP3")}</P>
        <P>{t("rightsP4")}</P>
      </Section>

      <Section title={t("changesTitle")}>
        <P>{t("changesP1")}</P>
      </Section>
    </article>
  );
}
