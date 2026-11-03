import "@/lib/server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { prisma } from "@/lib/db";
import { sendMagicLinkEmail } from "@/lib/email";
import { env } from "@/lib/env";

/**
 * Better Auth owns the `user` / `session` / `account` / `verification` tables in
 * our own Postgres, which is what lets application tables reference `User` with
 * a real foreign key.
 *
 * After enabling a new plugin, re-run:
 *   bun x @better-auth/cli@latest generate
 * and apply the resulting schema change as a migration.
 */

const googleCredentials =
  env.GOOGLE_CLIENT_ID !== undefined && env.GOOGLE_CLIENT_SECRET !== undefined
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;

/**
 * Offline there is no auth at all: no secret, no database, no session. Every
 * reader checks for `null` and behaves as signed out, which is what the game
 * is designed around anyway.
 */
export const auth = env.ONLINE && env.BETTER_AUTH_SECRET !== undefined ? buildAuth() : null;

function buildAuth() {
  return betterAuth({
    appName: "Devgame",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    database: prismaAdapter(prisma, { provider: "postgresql" }),

    socialProviders: googleCredentials ? { google: googleCredentials } : {},

    /**
     * Google is the front door, and the magic link is the way in when somebody
     * has no Google account or Google is down. Both routes prove the same thing —
     * control of an address — so a player who used one and then the other should
     * land in the same account rather than a duplicate, or worse, an error they
     * cannot get past.
     *
     * Only Google is trusted for automatic linking, because it verifies the
     * address itself. Linking on an unverified address would let anyone claim an
     * account by asserting its email.
     */
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },

    plugins: [
      magicLink({
        /**
         * Resend when it is configured. Without it, development writes the link
         * to the server log, enough to sign in locally; production throws
         * rather than swallow the attempt, so a deploy with neither Resend nor
         * Google lets **nobody** sign in.
         */
        async sendMagicLink({ email, url }) {
          if (env.EMAIL) {
            await sendMagicLinkEmail(email, url);
            return;
          }
          if (env.NODE_ENV === "production") {
            throw new Error(
              "Magic links cannot be sent: set RESEND_API_KEY and EMAIL_FROM (docs/hosting.md).",
            );
          }

          console.info(`\n  ✉  Magic link for ${email}:\n     ${url}\n`);
        },
        expiresIn: 60 * 15,
      }),

      // Must stay last: it flushes Better Auth's cookies into the Next.js response.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;
export type Session = Auth["$Infer"]["Session"];

/** Google sign-in is only offered when both OAuth credentials are present. */
export const isGoogleEnabled = googleCredentials !== undefined;
