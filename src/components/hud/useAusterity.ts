"use client";

import { useEffect, useRef } from "react";

import { austerityOverride } from "@/components/hud/austerityOverride";
import { useGameStore } from "@/game";
import { decorationsAt, hexOf, lerpColour, paletteAt } from "@/game/render/palette";

/** How long the page takes to slide from one look to the next: the canvas's pace. */
const SLIDE_MS = 600;

/**
 * Writes the run's look into the page: the same interpolated palette the
 * canvas draws with, as CSS variables on the root, eased over a moment so a
 * crossed threshold reads as the light changing. Everything the HUD colours
 * with — the theme tokens and shadcn's surfaces — follows. Removed on
 * unmount, so the site outside the run keeps its own colours.
 */
export function useAusterity(): void {
  const target = useGameStore((state) => state.snapshot?.austerity ?? 0);
  const current = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const override = austerityOverride();
    const goal = override ?? target;
    let frame = 0;
    let last = performance.now();

    const write = (value: number): void => {
      const p = paletteAt(value);
      const d = decorationsAt(value);
      const set = (name: string, colour: number): void =>
        root.style.setProperty(name, hexOf(colour));
      set("--color-bg", p.background);
      set("--color-panel", p.panel);
      set("--color-line", p.line);
      set("--color-branch-main", p.lane.trunk);
      set("--color-branch-dev", p.lane.dev);
      set("--color-branch-feature", p.lane.feature);
      set("--color-branch-hotfix", p.lane.hotfix);
      set("--color-debt", p.debt);
      set("--color-energy", p.energy);
      set("--color-money", p.money);
      set("--color-patience", p.patience);
      set("--color-time", p.time);
      set("--color-ai", p.node.ai);
      set("--background", p.background);
      set("--card", p.panel);
      set("--popover", p.panel);
      set("--border", p.line);
      set("--input", p.line);
      set("--muted", lerpColour(p.panel, p.line, 0.3));
      set("--secondary", lerpColour(p.panel, p.line, 0.3));
      set("--sidebar", p.panel);
      set("--sidebar-border", p.line);
      set("--foreground", p.text);
      set("--muted-foreground", p.textMuted);
      root.style.setProperty("--austerity", value.toFixed(3));
      root.style.setProperty("--austerity-grid", d.grid.toFixed(3));
      root.style.setProperty("--austerity-scan", d.scanlines.toFixed(3));
      root.style.setProperty("--austerity-jitter", d.jitter.toFixed(3));
      root.style.setProperty("--austerity-bits", d.bits.toFixed(3));
      root.style.setProperty("--austerity-rain", d.rain.toFixed(3));
    };

    const tick = (now: number): void => {
      const from = current.current ?? goal;
      const step = Math.min(1, (now - last) / SLIDE_MS);
      last = now;
      let next = from + (goal - from) * step;
      if (Math.abs(goal - next) < 0.001) next = goal;
      current.current = next;
      write(next);
      if (next !== goal) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  useEffect(() => {
    return () => {
      const style = document.documentElement.style;
      for (const name of [...style]) {
        if (name.startsWith("--color-") || name.startsWith("--austerity"))
          style.removeProperty(name);
      }
      for (const name of [
        "--background",
        "--card",
        "--popover",
        "--border",
        "--input",
        "--muted",
        "--secondary",
        "--sidebar",
        "--sidebar-border",
        "--foreground",
        "--muted-foreground",
      ]) {
        style.removeProperty(name);
      }
    };
  }, []);
}
