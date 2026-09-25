"use client";

import {
  easeInOutCubic,
  FLIGHT_MS,
  type FlightPath,
  growth,
  MAX_IN_FLIGHT,
  type Point,
  pathOf,
  pointOn,
  rgba,
  staggerOf,
  TRAIL_LENGTH,
} from "@/components/hud/gaugeFxMath";

/**
 * The balls that fly a figure to its gauge, drawn on one canvas over the page
 * and under the dialogs: one ball per unit, each on a path of its own, each
 * leaving a glowing trail, swelling early and landing at full size. A canvas
 * rather than elements, because a trail is the last few positions drawn
 * fading, and the page would pay for a dozen elements per ball.
 *
 * As the run turns austere, a growing share of the balls fly as bits: a 0
 * and a 1 taking turns, trail and all.
 */

interface Flight {
  path: FlightPath;
  start: number;
  duration: number;
  colour: number;
  bit: boolean;
  trail: Point[];
  land: () => void;
}

/** The core's radius at full size, in CSS pixels; the glow reaches four times out. */
const RADIUS = 4.5;
const GLOW = 4;
/** A bit's digit, in CSS pixels, and how often it flips. */
const BIT_SIZE = 13;
const BIT_FLIP_MS = 120;

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;
let flights: Flight[] = [];
let frame = 0;

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (canvas?.isConnected && context !== null) return context;
  canvas = document.createElement("canvas");
  canvas.className = "gauge-fx-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  context = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  return context;
}

function resize(): void {
  if (canvas === null || context === null) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

/** The share of balls that fly as bits, from the look the run has reached. */
function bitsChance(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--austerity-bits");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Flies `count` balls from `from` to `to`. `onLand(landed)` runs as each one
 * arrives, with how many have landed so far; if none could fly, it runs once
 * with all of them, at once.
 */
export function flyUnits(options: {
  from: Point;
  to: Point;
  colour: number;
  count: number;
  onLand: (landed: number) => void;
}): void {
  const ctx = ensureCanvas();
  const room = Math.max(0, MAX_IN_FLIGHT - flights.length);
  const count = Math.min(options.count, room);
  if (ctx === null || count === 0) {
    options.onLand(options.count);
    return;
  }

  const now = performance.now();
  const bits = bitsChance();
  let landed = 0;
  for (let i = 0; i < count; i += 1) {
    flights.push({
      path: pathOf(options.from, options.to, Math.random(), Math.random()),
      start: now + staggerOf(i, count),
      duration: FLIGHT_MS.min + Math.random() * (FLIGHT_MS.max - FLIGHT_MS.min),
      colour: options.colour,
      bit: Math.random() < bits,
      trail: [],
      land: () => {
        landed += 1;
        // A figure capped short of its units still lands all of them with its last ball.
        options.onLand(landed === count ? options.count : landed);
      },
    });
  }
  if (frame === 0) frame = requestAnimationFrame(draw);
}

/** The story was cut short: every ball goes now, without landing. */
export function cancelFlights(): void {
  flights = [];
  if (frame !== 0) cancelAnimationFrame(frame);
  frame = 0;
  context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

function draw(now: number): void {
  const ctx = context;
  if (ctx === null) {
    frame = 0;
    return;
  }
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  // Light adds up: where trails cross, they burn brighter.
  ctx.globalCompositeOperation = "lighter";

  const flying: Flight[] = [];
  for (const flight of flights) {
    const t = (now - flight.start) / flight.duration;
    if (t < 0) {
      flying.push(flight);
      continue;
    }
    if (t >= 1) {
      flight.land();
      continue;
    }
    const at = pointOn(flight.path, easeInOutCubic(t));
    flight.trail.push(at);
    if (flight.trail.length > TRAIL_LENGTH) flight.trail.shift();
    const size = 0.3 + 0.7 * growth(t);
    // The trail in plain paint: added light would burn a bright dot at every
    // joint, and read as a dotted line. The glow is the part that adds up.
    ctx.globalCompositeOperation = "source-over";
    drawTrail(ctx, flight, size);
    ctx.globalCompositeOperation = "lighter";
    if (flight.bit) drawBit(ctx, at, flight.colour, size, now);
    else drawBall(ctx, at, flight.colour, size);
    flying.push(flight);
  }
  flights = flying;

  ctx.globalCompositeOperation = "source-over";
  frame = flights.length > 0 ? requestAnimationFrame(draw) : 0;
  if (frame === 0) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}

/** The last positions, joined and tapering: thin and faint at the tail, the ball's width at its head. */
function drawTrail(ctx: CanvasRenderingContext2D, flight: Flight, size: number): void {
  const { trail, colour } = flight;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  for (let i = 1; i < trail.length; i += 1) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a === undefined || b === undefined) continue;
    const k = i / trail.length;
    ctx.strokeStyle = rgba(colour, 0.85 * k * k);
    ctx.lineWidth = Math.max(0.75, RADIUS * 2.2 * size * k);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawBall(ctx: CanvasRenderingContext2D, at: Point, colour: number, size: number): void {
  const radius = RADIUS * size;
  const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius * GLOW);
  glow.addColorStop(0, rgba(colour, 1));
  glow.addColorStop(0.3, rgba(colour, 0.5));
  glow.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius * GLOW, 0, Math.PI * 2);
  ctx.fill();
  // A white-hot core in the colour's ring: what reads as shining.
  const core = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
  core.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  core.addColorStop(0.5, rgba(colour, 1));
  core.addColorStop(1, rgba(colour, 0.8));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawBit(
  ctx: CanvasRenderingContext2D,
  at: Point,
  colour: number,
  size: number,
  now: number,
): void {
  const digit = Math.floor(now / BIT_FLIP_MS) % 2 === 0 ? "0" : "1";
  ctx.font = `700 ${Math.round(BIT_SIZE * (0.6 + 0.4 * size))}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = rgba(colour, 1);
  ctx.shadowBlur = 10 * size;
  ctx.fillStyle = rgba(colour, 1);
  ctx.fillText(digit, at.x, at.y);
  ctx.shadowBlur = 0;
}
