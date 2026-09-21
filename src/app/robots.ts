import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * `/play` is excluded deliberately. It is a signed-in, client-rendered canvas
 * with nothing for a crawler to read, and letting it into the index would put
 * an empty loading skeleton in search results under the game's own name.
 *
 * The API is excluded for the same reason it is excluded from the proxy: those
 * routes are not pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/fr/play", "/en/play"] }],
    sitemap: new URL("/sitemap.xml", env.APP_URL).toString(),
    host: env.APP_URL,
  };
}
