import { createNavigation } from "next-intl/navigation";

import { routing } from "@/i18n/routing";

/**
 * Always navigate through these, never through `next/navigation` or
 * `next/link` — the plain ones drop the locale prefix silently, which sends a
 * French player to the English page on the next click.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
