import "@/lib/server-only";

import { type Locale, routing } from "@/i18n/routing";
import { env } from "@/lib/env";

/**
 * The magic link, by email through Resend's HTTP API. A plain `fetch` rather
 * than the SDK: one endpoint, one call, no dependency to keep up to date.
 */

/**
 * The language of the page the player signed in from. Better Auth hands over
 * only the finished link, but its `callbackURL` carries the locale prefix the
 * login page wrote into it.
 */
export function localeOfMagicLink(url: string): Locale {
  const callback = new URL(url).searchParams.get("callbackURL") ?? "";
  const first = callback.split("/")[1] ?? "";
  return (routing.locales as readonly string[]).includes(first)
    ? (first as Locale)
    : routing.defaultLocale;
}

interface MagicLinkCopy {
  subject: string;
  intro: string;
  action: string;
  expiry: string;
  ignore: string;
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  if (env.RESEND_API_KEY === undefined || env.EMAIL_FROM === undefined) {
    throw new Error("Set RESEND_API_KEY and EMAIL_FROM to send sign-in links by email.");
  }

  const locale = localeOfMagicLink(url);
  // Dynamic import, like src/i18n/request.ts: the standalone build traces it.
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const copy = messages.email.magicLink as MagicLinkCopy;
  const href = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject: copy.subject,
      text: `${copy.intro}\n\n${url}\n\n${copy.expiry}\n${copy.ignore}`,
      html: [
        `<p>${copy.intro}</p>`,
        `<p><a href="${href}">${copy.action}</a></p>`,
        `<p style="color:#666;font-size:13px">${copy.expiry}<br>${copy.ignore}</p>`,
      ].join(""),
    }),
  });

  if (!response.ok) {
    // Resend's body names the problem (unverified domain, bad key); the
    // address is left out of the log on purpose.
    throw new Error(
      `Resend refused the sign-in email (${response.status}): ${await response.text()}. ` +
        "Check RESEND_API_KEY and that EMAIL_FROM's domain is verified at Resend.",
    );
  }
}
