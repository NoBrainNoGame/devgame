"use client";

import { MAX_PARTICLES, type Point } from "@/components/hud/gaugeFxMath";

/**
 * The sparks that evaporate off a gauge that drops: plain elements on one
 * fixed layer under the dialogs, animated by the Web Animations API, gone
 * when their animation ends. The balls that fly to a gauge are drawn on a
 * canvas of their own (`flights.ts`).
 */

let layer: HTMLDivElement | null = null;
let alive = 0;
const running = new Set<Animation>();

function ensureLayer(): HTMLDivElement {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.className = "gauge-fx-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  return layer;
}

function particle(className: string, colour: string, at: Point): HTMLElement | null {
  if (alive >= MAX_PARTICLES) return null;
  const element = document.createElement("span");
  element.className = className;
  element.style.setProperty("--fx-colour", colour);
  element.style.left = `${at.x}px`;
  element.style.top = `${at.y}px`;
  ensureLayer().appendChild(element);
  alive += 1;
  return element;
}

function track(animation: Animation, element: HTMLElement, done?: () => void): void {
  running.add(animation);
  const finish = (): void => {
    running.delete(animation);
    if (element.isConnected) {
      element.remove();
      alive = Math.max(0, alive - 1);
    }
    done?.();
  };
  animation.onfinish = finish;
  animation.oncancel = () => {
    running.delete(animation);
    if (element.isConnected) {
      element.remove();
      alive = Math.max(0, alive - 1);
    }
  };
}

/** Sparks evaporating off `rect`: they rise, drift, fade and shrink. */
export function sparks(rect: DOMRect, colour: string, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const at = {
      x: rect.left + Math.random() * rect.width,
      y: rect.top + Math.random() * rect.height,
    };
    const element = particle("gauge-fx-spark", i % 3 === 0 ? "#ffffff" : colour, at);
    if (element === null) return;
    const dx = (Math.random() - 0.5) * 36;
    const dy = -(14 + Math.random() * 30);
    const animation = element.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1, filter: "blur(0px)" },
        {
          transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(0.7)`,
          opacity: 0.7,
          filter: "blur(0.5px)",
        },
        { transform: `translate(${dx}px, ${dy}px) scale(0.1)`, opacity: 0, filter: "blur(2px)" },
      ],
      { duration: 520 + Math.random() * 360, easing: "ease-out", fill: "forwards" },
    );
    track(animation, element);
  }
}

/** The story was cut short: every particle goes now. */
export function cancelParticles(): void {
  for (const animation of [...running]) animation.cancel();
}
