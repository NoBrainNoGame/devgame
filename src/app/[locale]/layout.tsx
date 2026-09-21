import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routing } from "@/i18n/routing";

import "../globals.css";

/**
 * The whole site is set in a monospace face: the game is a git graph and the
 * UI is an IDE, so the typography is part of the fiction rather than decoration.
 */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-devgame-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Devgame",
  description: "Un roguelike où le donjon est un graphe Git.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
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
      className={`dark overflow-x-clip ${mono.variable}`}
      suppressHydrationWarning
    >
      {/* Radix portals its overlays into <body>, and an overlay that sticks out
          past the right edge would otherwise widen the document and scroll the
          whole app sideways. */}
      <body className="overflow-x-clip bg-background font-mono text-foreground antialiased">
        <NextIntlClientProvider>
          <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        </NextIntlClientProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
