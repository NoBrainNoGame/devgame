"use client";

import { useEffect, useState } from "react";

import { useRealtime } from "@/realtime/client/store";

/**
 * Seconds left until a deadline given on the server's clock, counted on this
 * one with the offset the welcome measured. Never negative; null with no
 * deadline. Redrawn four times a second, which is smooth enough for a number.
 */
export function useCountdown(deadline: number | null): number | null {
  const offset = useRealtime((state) => state.clockOffset);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (now + offset)) / 1000));
}
