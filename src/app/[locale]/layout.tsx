import type { Metadata } from "next";
import { JetBrains_Mono, Rajdhani } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Footer } from "@/components/shell/Footer";
import { Header } from "@/components/shell/Header";
import { VisitBeacon } from "@/components/shell/VisitBeacon";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routing } from "@/i18n/routing";
import { env } from "@/lib/env";
import { siteUrl } from "@/lib/seo";

import "../globals.css";

/**
 * Two faces. The game is set in a monospace one: it is a git graph and its
 * history reads like one. The chrome — titles, buttons, labels — is set in a
 * condensed display face, uppercase, the way a cyberpunk interface is.
 */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-devgame-mono",
  display: "swap",
});
const display = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-devgame-display",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Site-wide metadata.
 *
 * `metadataBase` is what lets every page below write relative URLs and still
 * emit absolute ones — without it, Next warns and social previews get a
 * half-formed image URL.
 *
 * The title template puts the app name after the page name rather than before:
 * a tab strip and a search result both truncate from the right, and "Classement"
 * is the useful half.
 *
 * Deliberately no `alternates` here. A canonical set on the layout is inherited
 * by every page under it, so each one would declare itself to *be* the home
 * page — which search engines resolve by dropping them from the index. Each
 * page sets its own, through `alternatesFor`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const resolved = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: resolved, namespace: "landing" });

  return {
    metadataBase: new URL(env.APP_URL),
    title: { default: t("title"), template: `%s — ${t("title")}` },
    description: t("metaDescription"),
    keywords: t("keywords").split(", "),
    applicationName: t("title"),
    openGraph: {
      type: "website",
      siteName: t("title"),
      title: t("title"),
      description: t("metaDescription"),
      locale: resolved === "fr" ? "fr_FR" : "en_GB",
      url: siteUrl(env.APP_URL, resolved),
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("metaDescription") },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    // The font variable goes on <html>, not <body>: the Tailwind theme resolves
    // `--font-mono` at `:root`, and a reference to a variable defined lower in
    // the tree is invalid there — which silently drops the whole declaration.
    <html
      lang={locale}
      className={`dark overflow-x-clip ${mono.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      {/* Radix portals its overlays into <body>, and an overlay that sticks out
          past the right edge would otherwise widen the document and scroll the
          whole app sideways. */}
      <body className="overflow-x-clip bg-background font-mono text-foreground antialiased">
        <NextIntlClientProvider>
          <TooltipProvider delayDuration={150}>
            {/* Exactly the viewport and no more: the header, the page, and the
                footer pinned under it on every route — the tip jar and the
                legal pages are not something to scroll for. Each route group
                decides what to do with what is left: the site group scrolls,
                the play group fills it and does not scroll. `min-h-dvh` here
                instead would let a flex child size to its content and push
                the page taller than the window. */}
            <div className="flex h-dvh flex-col">
              <Header />
              <main className="flex min-h-0 flex-1 flex-col">{children}</main>
              <Footer />
            </div>
            {/* Inside the intl provider: it reads the locale and the pathname. */}
            {env.ONLINE ? <VisitBeacon /> : null}
          </TooltipProvider>
        </NextIntlClientProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
