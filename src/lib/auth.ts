import "@/lib/server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { prisma } from "@/lib/db";
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

export const auth = betterAuth({
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
       * ⚠ WIRE THIS BEFORE YOU DEPLOY.
       *
       * No email provider ships with the starter, so in development the link
       * goes to the server log — enough to sign in locally. In production we
       * throw instead of silently swallowing sign-in attempts, which means that
       * unless you either fill in the Google OAuth pair or implement this
       * function, **nobody can sign in to your deployed app**.
       *
       * A minimal Resend implementation:
       *
       *   await new Resend(env.RESEND_API_KEY).emails.send({
       *     from: "you@yourdomain.com",
       *     to: email,
       *     subject: "Your sign-in link",
       *     text: url,
       *   });
       */
      async sendMagicLink({ email, url }) {
        if (env.NODE_ENV === "production") {
          throw new Error(
            "Magic link email sending is not configured. Wire an email provider " +
              "in src/lib/auth.ts before deploying.",
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

export type Session = typeof auth.$Infer.Session;

/** Google sign-in is only offered when both OAuth credentials are present. */
export const isGoogleEnabled = googleCredentials !== undefined;
