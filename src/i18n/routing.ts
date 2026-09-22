import { defineRouting } from "next-intl/routing";

/**
 * French is the source language: game copy is written in `messages/fr.json`
 * first and mirrored into `en.json`. `localePrefix: "always"` keeps every URL
 * unambiguous, which matters because leaderboard links get shared around.
 */
export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "always",
  // Every URL carries its locale, so the cookie only ever steered the bare
  // "/" redirect after a manual switch. Without it the site sets no cookie
  // at all for a signed-out visitor, which is what the privacy page says.
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
