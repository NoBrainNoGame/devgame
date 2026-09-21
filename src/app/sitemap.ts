import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { env } from "@/lib/env";
import { alternatesFor, INDEXABLE_PATHS, siteUrl } from "@/lib/seo";

/**
 * One entry per page per locale, each declaring the others as alternates.
 *
 * Listing the locales as alternates rather than as separate unrelated pages is
 * what tells a search engine these are translations of one thing, not
 * duplicates competing with each other.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return routing.locales.flatMap((locale) =>
    INDEXABLE_PATHS.filter((path) => path !== "/play").map((path) => ({
      url: siteUrl(env.APP_URL, locale, path),
      lastModified: now,
      changeFrequency: path === "/leaderboard" ? ("daily" as const) : ("monthly" as const),
      priority: path === "" ? 1 : path === "/leaderboard" ? 0.8 : 0.3,
      alternates: { languages: alternatesFor(env.APP_URL, locale, path).languages },
    })),
  );
}
