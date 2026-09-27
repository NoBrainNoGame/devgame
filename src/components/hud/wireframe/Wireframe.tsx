"use client";

import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/components/hud/motion";
import type { Mesh } from "@/components/hud/wireframe/mesh";
import { cn } from "@/lib/utils";

/**
 * A mesh turning on its vertical axis, drawn in lines only, glitching now
 * and then: the shop's picture of what it sells, in the look of a film's
 * hologram. The colour is the element's CSS `color`, so a Tailwind text
 * class tones it and the theme follows.
 *
 * A plain 2D canvas per model, not WebGL: a browser allows a dozen or so
 * WebGL contexts, and the shop shows thirty models. They all share one
 * animation loop at half the display's rate, skip what is off screen, and
 * stand still — one frame, drawn once — when motion is reduced.
 */

interface Entry {
  draw(time: number, dt: number): void;
}

const entries = new Set<Entry>();
let request = 0;
let last = 0;
let odd = false;

function tick(now: number): void {
  // Half the display's rate: a hologram does not need sixty frames.
  odd = !odd;
  if (odd) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const entry of entries) entry.draw(now / 1000, dt);
  }
  request = entries.size > 0 ? requestAnimationFrame(tick) : 0;
}

function register(entry: Entry): () => void {
  entries.add(entry);
  if (request === 0) {
    last = performance.now();
    request = requestAnimationFrame(tick);
  }
  return () => {
    entries.delete(entry);
    if (entries.size === 0 && request !== 0) {
      cancelAnimationFrame(request);
      request = 0;
    }
  };
}

/** Looking a little from above, so the tops of things read. */
const TILT = 0.32;
/** The camera's distance, in model radii: close enough for some perspective. */
const DISTANCE = 3.2;
/** Edges behind the model's centre are drawn this faint; the rest, bright. */
const FAR_ALPHA = 0.28;
const NEAR_ALPHA = 0.9;
/** The split of a glitch's colour channels, in CSS pixels. */
const SPLIT_PX = 2.5;

interface View {
  angle: number;
  width: number;
  height: number;
  /** Where the model's centre sits across the canvas, 0 to 1. */
  anchor: number;
  /** The model's radius, as a share of the canvas's shorter side. */
  zoom: number;
  /** Pixels the whole drawing is pushed sideways. */
  shift: number;
  /** Random scatter of the vertices, in model radii. */
  jitter: number;
}

function drawMesh(ctx: CanvasRenderingContext2D, mesh: Mesh, view: View, colour: string): void {
  const cos = Math.cos(view.angle);
  const sin = Math.sin(view.angle);
  const tiltCos = Math.cos(TILT);
  const tiltSin = Math.sin(TILT);
  const size = Math.min(view.width, view.height) * view.zoom;
  const cx = view.width * view.anchor + view.shift;
  const cy = view.height / 2;

  const points = mesh.vertices.map(([x, y, z]) => {
    const x1 = x * cos - z * sin;
    const z1 = x * sin + z * cos;
    const y2 = y * tiltCos - z1 * tiltSin;
    const z2 = y * tiltSin + z1 * tiltCos;
    const k = DISTANCE / (DISTANCE + z2);
    const j = view.jitter === 0 ? 0 : (Math.random() - 0.5) * view.jitter;
    return [cx + (x1 * k + j) * size, cy - y2 * k * size, z2] as const;
  });

  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  // Two passes: the far edges faint, the near ones bright — depth without a fill.
  for (const far of [true, false]) {
    ctx.globalAlpha = far ? FAR_ALPHA : NEAR_ALPHA;
    ctx.beginPath();
    for (const [a, b] of mesh.edges) {
      const p = points[a];
      const q = points[b];
      if (p === undefined || q === undefined) continue;
      if (p[2] + q[2] > 0 !== far) continue;
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function Wireframe({
  mesh,
  className,
  anchor = 0.5,
  zoom = 0.38,
  speed = 0.55,
}: {
  mesh: Mesh;
  className?: string;
  anchor?: number;
  zoom?: number;
  /** Radians a second. */
  speed?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (canvas === null || ctx === null || ctx === undefined) return;

    let visible = true;
    let colour = getComputedStyle(canvas).color;
    let colourAge = 0;
    const phase = Math.random() * Math.PI * 2;
    let glitchIn = 1 + Math.random() * 5;
    let glitchFor = 0;

    const fit = (): { width: number; height: number } => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width, height };
    };

    const paint = (angle: number, glitching: boolean): void => {
      const { width, height } = fit();
      ctx.clearRect(0, 0, width, height);
      const view: View = { angle, width, height, anchor, zoom, shift: 0, jitter: 0 };
      if (!glitching) {
        drawMesh(ctx, mesh, view, colour);
        return;
      }
      // The channels come apart, the vertices shiver, and a few rows tear
      // sideways: a signal that is not quite holding.
      ctx.globalCompositeOperation = "lighter";
      drawMesh(ctx, mesh, { ...view, shift: -SPLIT_PX, jitter: 0.04 }, "#ff2e63");
      drawMesh(ctx, mesh, { ...view, shift: SPLIT_PX, jitter: 0.04 }, colour);
      ctx.globalCompositeOperation = "source-over";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < 3; i += 1) {
        const y = Math.random() * canvas.height;
        const rows = 2 + Math.random() * canvas.height * 0.08;
        const offset = (Math.random() - 0.5) * canvas.width * 0.12;
        ctx.drawImage(canvas, 0, y, canvas.width, rows, offset, y, canvas.width, rows);
      }
    };

    if (reduced) {
      paint(phase, false);
      const resized = new ResizeObserver(() => paint(phase, false));
      resized.observe(canvas);
      return () => resized.disconnect();
    }

    const seen = new IntersectionObserver((records) => {
      for (const record of records) visible = record.isIntersecting;
    });
    seen.observe(canvas);

    const unregister = register({
      draw(time, dt) {
        if (!visible) return;
        colourAge += dt;
        if (colourAge > 1) {
          colour = getComputedStyle(canvas).color;
          colourAge = 0;
        }
        glitchIn -= dt;
        if (glitchIn <= 0) {
          glitchFor = 0.12 + Math.random() * 0.2;
          glitchIn = 3 + Math.random() * 6;
        }
        glitchFor = Math.max(0, glitchFor - dt);
        paint(phase + time * speed, glitchFor > 0);
      },
    });

    return () => {
      unregister();
      seen.disconnect();
    };
  }, [mesh, anchor, zoom, speed, reduced]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none", className)} />;
}
