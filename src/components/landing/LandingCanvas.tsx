"use client";

import { useEffect, useRef } from "react";

import { GraphTooltip } from "@/components/hud/GraphTooltip";
import { useGameText } from "@/components/hud/useGameText";
import type { I18nText, LandingHandle } from "@/game";
import { mountLanding } from "@/game";

/**
 * The game's scene on the demo run. A click plays the sprint again from
 * nothing; hovering a commit shows what it was, the way it does in a run.
 */
export function LandingCanvas({ label }: { label: string }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<LandingHandle | null>(null);
  const gameText = useGameText();

  // The scene only needs to be able to call the translator; going through a
  // ref keeps a re-render from remounting the run.
  const translateRef = useRef<(text: I18nText) => string>(() => "");
  translateRef.current = gameText;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;

    void mountLanding(host, {
      translate: (value) => translateRef.current(value),
      reducedMotion,
    }).then((handle) => {
      if (cancelled) {
        handle.dispose();
        return;
      }
      handleRef.current = handle;
    });

    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  return (
    <div className="relative size-full">
      {/* The canvas is the button: the whole picture replays on a click. */}
      <button
        type="button"
        aria-label={label}
        className="block size-full cursor-pointer appearance-none border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => handleRef.current?.replay()}
      >
        <div ref={hostRef} className="size-full" />
      </button>
      <GraphTooltip />
    </div>
  );
}
