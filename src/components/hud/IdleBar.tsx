"use client";

import { useIdleProgress } from "@/components/hud/IdleDriver";
import { actionKey, idleTarget, type PlayerAction, useGameStore } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The idle clock's bar, drawn under the one button the clock will press.
 *
 * Every button that can be the clock's move hosts one of these; only the
 * button whose action is the planned move shows it. The host is `relative`.
 */
export function IdleBar({ action }: { action: PlayerAction }): React.JSX.Element | null {
  const snapshot = useGameStore((state) => state.snapshot);
  const { pct, running, enabled } = useIdleProgress();
  if (!enabled || snapshot === null) return null;

  const target = idleTarget(snapshot);
  if (target === undefined || actionKey(target) !== actionKey(action)) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 overflow-hidden rounded-full bg-line"
      aria-hidden
    >
      <div
        className={cn(
          "h-full transition-[width] duration-100 ease-linear",
          snapshot.autopilot ? "bg-branch-feature" : "bg-energy",
          !running && "opacity-40",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
