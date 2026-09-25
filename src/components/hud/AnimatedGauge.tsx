"use client";

import { useEffect, useRef, useState } from "react";

import { lossSegment } from "@/components/hud/gaugeFxMath";
import { useReducedMotion } from "@/components/hud/motion";
import { sparks } from "@/components/hud/particles";
import { cn } from "@/lib/utils";

/**
 * A HUD gauge that shows how it moved. It fills with a short slide; when it
 * drops, it flashes red, the piece it loses blinks white as it shrinks away,
 * and sparks evaporate off it. `upper` draws the rest of a blurred band, faint.
 * `gauge` names it for the balls that fly to it (`data-gauge`).
 */
export function AnimatedGauge({
  value,
  upper,
  gauge,
  barClassName,
  className,
}: {
  /** In percent of the bar. */
  value: number;
  /** The top of a blurred band, in percent. */
  upper?: number;
  gauge: string;
  barClassName: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const previous = useRef(value);
  const [loss, setLoss] = useState<{ left: number; width: number; key: number } | null>(null);
  const [hit, setHit] = useState(0);
  const pct = Math.max(0, Math.min(100, value));

  useEffect(() => {
    const before = previous.current;
    previous.current = pct;
    const segment = lossSegment(before, pct);
    if (segment === null) return;
    setHit((n) => n + 1);
    if (reduced) return;
    setLoss({ ...segment, key: Date.now() });
    const box = track.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return;
    const colour = getComputedStyle(document.documentElement).getPropertyValue(
      "--color-branch-hotfix",
    );
    const piece = new DOMRect(
      box.left + (box.width * segment.left) / 100,
      box.top - 2,
      Math.max(4, (box.width * segment.width) / 100),
      box.height + 4,
    );
    sparks(piece, colour.trim() || "#ff5533", Math.min(12, 3 + Math.round(segment.width / 6)));
  }, [pct, reduced]);

  return (
    <div
      ref={track}
      data-gauge={gauge}
      className={cn("relative h-1 w-full overflow-hidden bg-muted", className)}
    >
      {upper === undefined || upper <= pct ? null : (
        <div
          className={cn("absolute inset-y-0 left-0 opacity-35", barClassName)}
          style={{ width: `${Math.min(100, upper)}%` }}
        />
      )}
      <div
        className={cn("relative h-full transition-[width] duration-300 ease-out", barClassName)}
        style={{ width: `${pct}%` }}
      />
      {loss === null ? null : (
        <div
          key={loss.key}
          className="gauge-loss absolute inset-y-0 bg-white"
          style={{ left: `${loss.left}%`, width: `${loss.width}%` }}
          onAnimationEnd={() => setLoss(null)}
        />
      )}
      {hit === 0 ? null : (
        <div key={hit} className="gauge-hit pointer-events-none absolute inset-0" />
      )}
    </div>
  );
}
