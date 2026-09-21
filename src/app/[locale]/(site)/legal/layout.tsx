import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

/**
 * The three legal pages share one narrow measure and one footer: the pages
 * themselves only carry their heading and their text.
 *
 * The routes keep their French paths in both locales. `routing.ts` has no
 * `pathnames` map, and adding one to translate three URLs would change how
 * every link in the app is typed.
 */
const PAGES = [
  { href: "/legal/mentions-legales", key: "notice" },
  { href: "/legal/confidentialite", key: "privacy" },
  { href: "/legal/conditions", key: "terms" },
] as const;

export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const [nav, common] = await Promise.all([
    getTranslations("legal.nav"),
    getTranslations("legal.common"),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-8 sm:px-4 sm:py-12">
      {children}

      <nav
        aria-label={nav("aria")}
        className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-1 border-line border-t pt-6 text-xs"
      >
        {PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {nav(page.key)}
          </Link>
        ))}
        <Link
          href="/"
          className="text-muted-foreground transition-colors hover:text-branch-main sm:ml-auto"
        >
          {common("back")}
        </Link>
      </nav>
    </div>
  );
}
