"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

import { usePathname } from "@/i18n/navigation";
import { SESSION_KEYS } from "@/lib/storage/keys";

/**
 * Counts a page view on every navigation, and a visit the first time this
 * tab opens one. Sends three bounded fields and reads nothing back; the
 * only thing it keeps is a flag in `sessionStorage`, which dies with the
 * tab. Mounted only on an online instance: offline there is nowhere to
 * count, and no request is made at all.
 */
export function VisitBeacon(): null {
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => {
    let first = false;
    try {
      if (window.sessionStorage.getItem(SESSION_KEYS.visited) === null) {
        window.sessionStorage.setItem(SESSION_KEYS.visited, "1");
        first = true;
      }
    } catch {
      // A private window may refuse storage; the view still counts, as a view.
    }
    void fetch("/api/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, locale, first }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname, locale]);

  return null;
}
