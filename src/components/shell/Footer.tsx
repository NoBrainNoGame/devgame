import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

/** The routes keep their French paths in both locales — see the legal layout. */
const LEGAL_PAGES = [
  { href: "/legal/mentions-legales", key: "notice" },
  { href: "/legal/confidentialite", key: "privacy" },
  { href: "/legal/conditions", key: "terms" },
] as const;

/** One line. The concept, a way back to it, and the pages the law wants. */
export async function Footer(): Promise<React.JSX.Element> {
  const [common, landing, nav] = await Promise.all([
    getTranslations("common"),
    getTranslations("landing"),
    getTranslations("legal.nav"),
  ]);

  return (
    <footer className="shrink-0 border-line border-t px-3 py-3 text-muted-foreground text-xs sm:px-4">
      {/* One row while it fits, two when it does not: the tagline and the legal
          links wrap as separate blocks rather than breaking mid-sentence. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="min-w-0">
          <Link href="/" className="text-foreground transition-colors hover:text-branch-main">
            {common("appName")}
          </Link>
          {" — "}
          {landing("tagline")}
        </p>

        <nav aria-label={nav("aria")} className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
          {LEGAL_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="transition-colors hover:text-foreground"
            >
              {nav(page.key)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
