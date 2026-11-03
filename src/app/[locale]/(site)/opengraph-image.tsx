import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { hasLocale } from "next-intl";

import { routing } from "@/i18n/routing";

/**
 * The card people see before they see the site: a capture of the landing page
 * itself, in the visitor's language, so the link previews exactly what it opens.
 *
 * One PNG per locale in `src/assets/og`, 1200×630 (the size every network
 * expects). Retake them when the landing page changes. Read at build time:
 * the route is prerendered for each locale, so nothing is read per request.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Devgame";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Response> {
  // A promise since Next 15: read synchronously, `locale` is undefined and
  // every language gets the default card.
  const requested = (await params).locale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const image = await readFile(join(process.cwd(), "src/assets/og", `${locale}.png`));
  return new Response(new Uint8Array(image), { headers: { "content-type": contentType } });
}
