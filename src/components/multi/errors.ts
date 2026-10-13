"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { notify } from "@/components/ui/notify";
import { useRealtime } from "@/realtime/client/store";

/** The codes the server and the client use; anything else reads as "something went wrong". */
const KNOWN = new Set([
  "seated",
  "not-seated",
  "closed",
  "full",
  "no-company",
  "cannot-join",
  "bad-name",
  "world-full",
  "not-waiting",
  "stale-round",
  "illegal",
  "deciding",
  "turn-action",
  "free-action",
  "vote",
  "no-question",
  "bad-choice",
  "bad-message",
  "internal",
  "outdated",
  "offline",
  "no-round",
]);

export function errorKey(code: string): string {
  return KNOWN.has(code) ? code : "unknown";
}

/** Says the server's refusals out loud, once each, and forgets them. */
export function useRealtimeErrors(): void {
  const t = useTranslations("multi.errors");
  const errors = useRealtime((state) => state.errors);
  const dispatch = useRealtime((state) => state.dispatch);
  useEffect(() => {
    for (const error of errors) {
      notify.error(t(errorKey(error.code) as never), { id: `multi:${error.code}` });
      dispatch({ type: "dismissed", at: error.at });
    }
  }, [errors, dispatch, t]);
}
