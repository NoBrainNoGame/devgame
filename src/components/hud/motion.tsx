"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Whether the HUD may move: the player's own setting, or the system's
 * "reduce motion". Without it, the gauges still change and still flash a
 * colour, but nothing flies, blinks or sparks.
 */
const ReducedMotionSetting = createContext(false);

export function ReducedMotionProvider({
  reduced,
  children,
}: {
  reduced: boolean;
  children: React.ReactNode;
}) {
  return <ReducedMotionSetting.Provider value={reduced}>{children}</ReducedMotionSetting.Provider>;
}

export function useReducedMotion(): boolean {
  const setting = useContext(ReducedMotionSetting);
  const [system, setSystem] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setSystem(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return setting || system;
}
