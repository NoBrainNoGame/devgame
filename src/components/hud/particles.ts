"use client";

import {
  arcKeyframes,
  FLIGHT_MS,
  MAX_PARTICLES,
  type Point,
  STAGGER_MS,
} from "@/components/hud/gaugeFxMath";

/**
 * The particles of the HUD: balls (or bits) flying from a figure to its
 * gauge, and sparks evaporating off a gauge that drops. Plain elements on one
 * fixed layer under the dialogs, animated by the Web Animations API, gone
 * when their animation ends.
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

/** The share of balls that fly as bits, from the look the run has reached. */
function bitsChance(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--austerity-bits");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
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

/**
 * Flies `count` balls from `from` to `to`. `onArrive` runs once, when the
 * first lands — the moment the gauge moves; if none could fly, at once.
 */
export function flyBalls(options: {
  from: Point;
  to: Point;
  colour: string;
  count: number;
  onArrive: () => void;
}): void {
  let arrived = false;
  const arrive = (): void => {
    if (arrived) return;
    arrived = true;
    options.onArrive();
  };
  const bits = bitsChance();
  let launched = 0;
  for (let i = 0; i < options.count; i += 1) {
    const bit = Math.random() < bits;
    const element = particle(bit ? "gauge-fx-bit" : "gauge-fx-ball", options.colour, options.from);
    if (element === null) break;
    if (bit) {
      element.innerHTML =
        '<span class="gauge-fx-bit-0">0</span><span class="gauge-fx-bit-1">1</span>';
      element.style.animationDelay = `${-Math.random() * 200}ms`;
    }
    const jitter = { x: (Math.random() - 0.5) * 18, y: (Math.random() - 0.5) * 10 };
    const frames = arcKeyframes(
      options.from,
      { x: options.to.x + jitter.x, y: options.to.y + jitter.y },
      6,
      40 + Math.random() * 40,
    );
    const animation = element.animate(
      frames.map((p, index) => ({
        transform: `translate(${p.x}px, ${p.y}px) scale(${index === frames.length - 1 ? 0.4 : 1})`,
        opacity: index === frames.length - 1 ? 0.2 : 1,
      })),
      {
        duration: FLIGHT_MS - STAGGER_MS * i,
        delay: STAGGER_MS * i,
        easing: "cubic-bezier(0.45, 0, 0.55, 1)",
        fill: "forwards",
      },
    );
    track(animation, element, arrive);
    launched += 1;
  }
  if (launched === 0) arrive();
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
