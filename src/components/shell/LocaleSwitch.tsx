"use client";

import { useLocale } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Two links' worth of locale toggle, sitting in the header on every page.
 *
 * A dropdown for two options costs a click and a portal; a segmented pair
 * reads like a terminal flag and fits the 380px header.
 */
export function LocaleSwitch(): React.JSX.Element {
  const active = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-line text-xs">
      {routing.locales.map((locale) => {
        const current = locale === active;

        return (
          <button
            key={locale}
            type="button"
            aria-current={current ? "true" : undefined}
            onClick={() => {
              // The query string comes from `window` rather than from
              // `useSearchParams`: that hook would force a Suspense boundary
              // around the header on every statically rendered page, and this
              // handler only ever runs in the browser anyway.
              router.replace(`${pathname}${window.location.search}`, { locale });
            }}
            className={cn(
              "px-2 py-1 uppercase transition-colors",
              current ? "bg-line text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {locale}
          </button>
        );
      })}
    </div>
  );
}
