"use client";

import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/components/hud/motion";

/** Half-width katakana, digits and a few signs: the columns of a certain film. */
const GLYPHS = `${String.fromCharCode(
  ...Array.from({ length: 0xff9d - 0xff66 + 1 }, (_, i) => 0xff66 + i),
)}0123456789=+-*:.<>|`;
const CELL = 14;
const FPS = 24;
/** Even at its densest, the rain stays behind the graph, never over it. */
const MAX_OPACITY = 0.4;

function cssNumber(name: string): number {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(value) ? value : 0;
}

/**
 * The rain behind the graph as the run turns austere: columns of glyphs
 * falling, more of them and more visible as `--austerity-rain` climbs from 0
 * to 1 (`decorationsAt`), so it never switches on. A plain 2D canvas under the
 * game's own, so it outlives a lost WebGL context and looks the same drawn
 * by Canvas2D. Still with reduced motion: a few scattered glyphs, no fall.
 */
export function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (canvas === null || context === null || context === undefined) return;

    let width = 0;
    let height = 0;
    let heads: number[] = [];
    // Each column's own threshold: it falls once the rain passes it, so the
    // columns join one by one as the run climbs.
    let thresholds: number[] = [];
    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const columns = Math.ceil(width / CELL);
      heads = Array.from({ length: columns }, () => Math.random() * (height / CELL));
      thresholds = Array.from({ length: columns }, () => Math.random());
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const glyph = (): string => GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
    const paint = (rain: number, falling: boolean): void => {
      canvas.style.opacity = String(rain * MAX_OPACITY);
      if (rain <= 0) {
        context.clearRect(0, 0, width, height);
        return;
      }
      // The trail fades out rather than being painted over: the canvas stays
      // transparent where nothing falls.
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = falling ? "rgba(0, 0, 0, 0.12)" : "rgba(0, 0, 0, 1)";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "source-over";
      context.fillStyle =
        getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim() ||
        "#8afff5";
      context.font = `${CELL}px ui-monospace, monospace`;
      for (let column = 0; column < heads.length; column += 1) {
        if ((thresholds[column] ?? 1) > rain) continue;
        const row = heads[column] ?? 0;
        if (falling) {
          context.fillText(glyph(), column * CELL, row * CELL);
          const next = row + 1;
          heads[column] = next * CELL > height && Math.random() > 0.97 ? 0 : next;
        } else {
          for (let i = 0; i < 3; i += 1) {
            context.fillText(glyph(), column * CELL, Math.random() * height);
          }
        }
      }
    };

    let frame = 0;
    let last = 0;
    if (reduced) {
      // Still: one scattered frame, redrawn only when the look moves on.
      let drawn = -1;
      const timer = window.setInterval(() => {
        const rain = cssNumber("--austerity-rain");
        if (Math.abs(rain - drawn) < 0.01) return;
        drawn = rain;
        paint(rain, false);
      }, 1000);
      paint(cssNumber("--austerity-rain"), false);
      return () => {
        window.clearInterval(timer);
        observer.disconnect();
      };
    }
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / FPS) return;
      last = now;
      paint(cssNumber("--austerity-rain"), true);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [reduced]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <canvas ref={ref} className="size-full" style={{ opacity: 0 }} />
    </div>
  );
}
