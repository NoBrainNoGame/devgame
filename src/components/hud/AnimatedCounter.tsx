"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/components/hud/motion";
import { sparks } from "@/components/hud/particles";
import { cn } from "@/lib/utils";

/**
 * A HUD figure without a bar — the money, the skill points — that shows how
 * it moved: a red flash and sparks when it drops, a glow when it rises.
 * `gauge` names it for the balls that fly to it.
 */
export function AnimatedCounter({
  value,
  gauge,
  className,
  children,
}: {
  value: number;
  gauge: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const [change, setChange] = useState<{ up: boolean; key: number } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (value === before) return;
    const up = value > before;
    setChange({ up, key: Date.now() });
    if (up || reduced) return;
    const rect = box.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return;
    const colour = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-branch-hotfix",
    );
    sparks(rect, colour.trim() || "#ff5533", 8);
  }, [value, reduced]);

  return (
    <span
      ref={box}
      data-gauge={gauge}
      className={cn(
        "relative inline-flex items-center gap-1.5",
        change !== null && (change.up ? "counter-gain" : "counter-hit"),
        className,
      )}
      key={change?.key}
      onAnimationEnd={() => setChange(null)}
    >
      {children}
    </span>
  );
}
