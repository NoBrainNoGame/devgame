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
});

export type Locale = (typeof routing.locales)[number];
