import { defineRouting } from "next-intl/routing";

/**
 * French is the source language and the site's own: its URLs carry no prefix
 * (`/play`), English ones do (`/en/play`). Every URL still names one language,
 * so a shared leaderboard link opens in the language it was shared in.
 */
export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "as-needed",
  // No negotiation: `/` is French whatever the browser asks for. With it, and
  // no cookie to remember a manual switch, an English browser choosing French
  // would land on `/` and be sent straight back to `/en`.
  localeDetection: false,
  // The site sets no cookie for a signed-out visitor, as the privacy page says.
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];

/**
 * `path` in `locale`, for the few places that build a URL by hand instead of
 * through `@/i18n/navigation`: Better Auth's callback, metadata, the sitemap.
 */
export function localizedPath(locale: string, path: string): string {
  if (locale === routing.defaultLocale) return path === "" ? "/" : path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
