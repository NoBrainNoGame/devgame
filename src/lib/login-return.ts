/**
 * Where the login page sends a player once they are signed in: back to the
 * page that sent them there, carried in `?next=`.
 *
 * The value comes from the URL, so anyone can write it. Only a plain in-app
 * path is honoured — no scheme, no host, no `//` — or the magic link would be
 * an open redirect to wherever a crafted link pointed.
 */

/** Where a sign-in lands when nothing better is known. */
export const DEFAULT_RETURN = "/play";

const SAFE_PATH = /^\/(?:[a-z0-9-]+(?:\/[A-Za-z0-9_-]+)*)?$/;

/** The return path in `raw` if it is safe, without its locale prefix; otherwise null. */
export function parseReturnPath(raw: unknown, locales: readonly string[]): string | null {
  if (typeof raw !== "string" || raw.length > 200 || !SAFE_PATH.test(raw)) return null;
  const first = raw.split("/")[1] ?? "";
  // The caller adds the locale; a path that already carries one would get two.
  const path = locales.includes(first) ? raw.slice(first.length + 1) || "/" : raw;
  return path.startsWith("/login") ? null : path;
}

/** The login page's href for a player coming from `from` (a path without locale). */
export function loginHref(from: string): string {
  // The header's sign-in button is on the login page too; it must not point back at itself.
  return from === DEFAULT_RETURN || from.startsWith("/login")
    ? "/login"
    : `/login?next=${encodeURIComponent(from)}`;
}
