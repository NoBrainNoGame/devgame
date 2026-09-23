import { z } from "zod";

import { routing } from "@/i18n/routing";

/**
 * The page-view counter, and what it is allowed to count.
 *
 * It counts pages, not people: a day, a route, a language, and how many
 * times the route was opened. The route is one of a fixed list — anything
 * else is "/other" — so nobody can write a string of their choosing into the
 * table by opening a URL. No cookie is set, no address is stored, and a
 * browser that sends Global Privacy Control is not counted at all.
 */

export const KNOWN_PATHS = [
  "/",
  "/play",
  "/leaderboard",
  "/profile",
  "/login",
  "/report",
  "/legal",
  "/other",
] as const;

export type KnownPath = (typeof KNOWN_PATHS)[number];

/** The route a pathname belongs to, with its locale prefix already removed. */
export function normalisePath(pathname: string): KnownPath {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed === "/") return "/";
  const first = `/${trimmed.split("/")[1] ?? ""}`;
  return (KNOWN_PATHS as readonly string[]).includes(first) && first !== "/other"
    ? (first as KnownPath)
    : "/other";
}

/** What the beacon sends. Small on purpose: three fields, all bounded. */
export const VisitSchema = z.object({
  path: z.string().max(200),
  locale: z.enum(routing.locales),
  /** True the first time this browser tab opens a page: a visit, not just a view. */
  first: z.boolean(),
});

export type VisitInput = z.infer<typeof VisitSchema>;

/** Today, as the UTC date the table is keyed by. */
export function utcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
