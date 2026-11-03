"use client";

import { useEffect } from "react";

/** A woken free-tier server sleeps again after 15 minutes without traffic. */
const INTERVAL_MS = 10 * 60 * 1000;

/**
 * Wakes the realtime server as soon as someone opens the site, so the cold
 * start (up to a minute on a free host that sleeps when idle) is spent while
 * the player reads the page rather than once they press "play online".
 *
 * One `GET /realtime/health` on arrival, then again every 10 minutes, but only
 * while the tab is visible: the server stays awake while someone is actually
 * here, and goes back to sleep after they leave. `no-cors` because the
 * answer is never read — reaching the server is the whole point.
 */
export function RealtimeWake({ healthUrl }: { healthUrl: string }): null {
  useEffect(() => {
    let last = 0;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < INTERVAL_MS) return;
      last = now;
      void fetch(healthUrl, { mode: "no-cors", cache: "no-store" }).catch(() => undefined);
    };
    ping();
    const timer = window.setInterval(ping, INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [healthUrl]);

  return null;
}
