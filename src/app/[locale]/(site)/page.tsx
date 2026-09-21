import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const HOW_IT_WORKS = ["howItWorks1", "howItWorks2", "howItWorks3"] as const;

export default async function HomePage(): Promise<React.JSX.Element> {
  const t = await getTranslations("landing");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">{t("title")}</h1>
      <p className="mt-2 text-branch-main text-sm sm:text-base">{t("tagline")}</p>

      <BranchGraph />

      <p className="mt-8 max-w-prose text-muted-foreground text-sm leading-relaxed">{t("pitch")}</p>

      <Button asChild size="lg" className="mt-8">
        <Link href="/play">{t("cta")}</Link>
      </Button>

      <section className="mt-12">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("howItWorksTitle")}
        </h2>
        <ol className="mt-4 space-y-3 text-sm">
          {HOW_IT_WORKS.map((key, index) => (
            <li key={key} className="flex gap-3">
              <span className="shrink-0 text-branch-feature tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="max-w-prose text-muted-foreground leading-relaxed">{t(key)}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-10 border-line border-t pt-4 text-muted-foreground text-xs">
        {t("dailySeed")}
      </p>
    </div>
  );
}

/**
 * The pitch in one glyph: a main line, a feature that merges back, a hotfix
 * that does not, and a bot branch running underneath. Decorative — the page
 * reads the same with it switched off — so it is hidden from assistive tech.
 */
function BranchGraph(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 320 112"
      aria-hidden="true"
      focusable="false"
      className="mt-8 h-auto w-full max-w-sm"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 56 H308" className="stroke-branch-main" />
      <path
        d="M96 56 C112 56 112 24 128 24 H184 C200 24 200 56 208 56"
        className="stroke-branch-feature"
      />
      <path d="M208 56 C224 56 224 30 240 30" className="stroke-branch-hotfix" />
      <path
        d="M40 56 C56 56 56 88 72 88 H232 C248 88 248 56 264 56"
        className="stroke-branch-bot"
        strokeDasharray="4 5"
      />

      {[40, 96, 152, 208, 264].map((cx) => (
        <circle key={cx} cx={cx} cy={56} r={4.5} className="fill-bg stroke-branch-main" />
      ))}
      {[128, 184].map((cx) => (
        <circle key={cx} cx={cx} cy={24} r={4.5} className="fill-bg stroke-branch-feature" />
      ))}
      <circle cx={240} cy={30} r={4.5} className="fill-bg stroke-branch-hotfix" />
      {[72, 232].map((cx) => (
        <circle key={cx} cx={cx} cy={88} r={4.5} className="fill-bg stroke-branch-bot" />
      ))}
    </svg>
  );
}
