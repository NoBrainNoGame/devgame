import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";

/**
 * Locale negotiation and prefixing. Everything under `/api` is excluded: Better
 * Auth builds its own callback URLs and a locale prefix there breaks sign-in.
 */
export default createMiddleware(routing);

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
