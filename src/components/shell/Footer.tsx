import { Coffee, GitBranch, Mail } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LINKS } from "@/lib/links";

/** The routes keep their French paths in both locales — see the legal layout. */
const LEGAL_PAGES = [
  { href: "/legal/mentions-legales", key: "notice" },
  { href: "/legal/confidentialite", key: "privacy" },
  { href: "/legal/conditions", key: "terms" },
] as const;

/** The places the project lives outside the site, each with its icon. */
const OUTSIDE = [
  { href: LINKS.repository, key: "source", Icon: GitBranch },
  { href: LINKS.support, key: "support", Icon: Coffee },
  { href: LINKS.contact, key: "contact", Icon: Mail },
] as const;

/**
 * One line, or two. The concept and a way back to it; the code, the tip
 * jar and the address; and the pages the law wants.
 */
export async function Footer(): Promise<React.JSX.Element> {
  const [common, landing, nav, outside] = await Promise.all([
    getTranslations("common"),
    getTranslations("landing"),
    getTranslations("legal.nav"),
    getTranslations("footer"),
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

        <nav aria-label={outside("aria")} className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
          {OUTSIDE.map((item) => (
            <a
              key={item.key}
              href={item.href}
              // The address opens the mail client; the two others leave the site.
              {...(item.href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener" })}
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              <item.Icon aria-hidden="true" className="size-3.5" />
              {outside(item.key)}
            </a>
          ))}
        </nav>

        <nav aria-label={nav("aria")} className="flex flex-wrap gap-x-4 gap-y-1">
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
