import { routing } from "@/i18n/routing";

/**
 * The handful of absolute URLs that metadata needs.
 *
 * Search engines and link previews want fully qualified URLs, and the site is
 * served under a locale prefix, so every canonical and every alternate has to
 * be built rather than guessed. Doing it in one place is what stops the sitemap
 * and the `<head>` from disagreeing about what the canonical URL is — a
 * disagreement search engines resolve by ignoring both.
 *
 * The origin comes from `APP_URL`, which is the only thing that knows the real
 * domain. In development that is `http://localhost:3000`, which is correct:
 * a canonical pointing at production from a local build is worse than one
 * pointing at localhost.
 */

/** Routes worth listing, without their locale prefix. */
export const INDEXABLE_PATHS = [
  "",
  "/play",
  "/leaderboard",
  "/legal/mentions-legales",
  "/legal/confidentialite",
  "/legal/conditions",
] as const;

export type IndexablePath = (typeof INDEXABLE_PATHS)[number];

export function siteUrl(origin: string, locale: string, path = ""): string {
  return new URL(`/${locale}${path}`, origin).toString();
}

/**
 * `alternates` for one page: its canonical, one `hreflang` per locale, and an
 * `x-default` pointing at the default locale.
 *
 * `x-default` is what a search engine serves to someone whose language we do
 * not publish. Without it, a Spanish reader gets whichever locale happened to
 * rank.
 */
export function alternatesFor(
  origin: string,
  locale: string,
  path: IndexablePath | string = "",
): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = {};
  for (const other of routing.locales) languages[other] = siteUrl(origin, other, path);
  languages["x-default"] = siteUrl(origin, routing.defaultLocale, path);

  return { canonical: siteUrl(origin, locale, path), languages };
}
