import type { ReactNode } from "react";

import type { CompetitorId } from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * An emblem per company, drawn in lines like the rest of the HUD. Original
 * marks that point at what the company is, never the real logos: those
 * belong to the publishers of the games the winks come from (`docs/lore.md`).
 *
 * Exhaustive over `CompetitorId`, so a new company does not compile without
 * its emblem.
 */

/** A polyline through points, as an SVG path. */
function through(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join("");
}

function polar(radius: number, degrees: number): [number, number] {
  const angle = (degrees * Math.PI) / 180;
  return [12 + radius * Math.cos(angle), 12 + radius * Math.sin(angle)];
}

function polygon(sides: number, radius: number, turn = -90): string {
  const points = Array.from({ length: sides + 1 }, (_, i) =>
    polar(radius, turn + (360 * i) / sides),
  );
  return through(points);
}

const SPIRAL = through(
  Array.from({ length: 64 }, (_, i) => {
    const angle = i * 0.26;
    return polar(0.6 + angle * 0.62, (angle * 180) / Math.PI);
  }),
);

const IRIS = Array.from({ length: 6 }, (_, i) => {
  const from = polar(4, i * 60);
  const to = polar(9, i * 60 + 75);
  return through([from, to]);
}).join("");

const HELIX = (() => {
  // One and a half turns over the height: tighter and the strands blur into rings.
  const x = (y: number, phase: number) => 12 + 4.5 * Math.sin((y - 3) * 0.52 + phase);
  const strand = (phase: number) =>
    through(Array.from({ length: 37 }, (_, i) => [x(3 + i * 0.5, phase), 3 + i * 0.5] as const));
  const rungs = [5, 9, 13, 17, 20]
    .map((y) =>
      through([
        [x(y, 0), y],
        [x(y, Math.PI), y],
      ]),
    )
    .join("");
  return strand(0) + strand(Math.PI) + rungs;
})();

const COUNCIL = Array.from({ length: 7 }, (_, i) => polar(7, -90 + (360 * i) / 7));

const MARKS: Record<CompetitorId, ReactNode> = {
  // The family is gone; the fog stayed.
  brume: (
    <path d="M3 8c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M5 12c2-1.6 4-1.6 6 0s4 1.6 6 0M3 16c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
  ),
  // Seats around a table, and nobody in the middle.
  quorum: (
    <>
      {COUNCIL.map(([x, y]) => (
        <circle key={`${x}:${y}`} cx={x} cy={y} r={1.6} />
      ))}
    </>
  ),
  // The edge of the wood.
  lisiere: (
    <path d="M3 19h18M4 17l3-8 3 8M9 17l3.5-10 3.5 10M15 17l2.5-6 2.5 6M7 17v2M12.5 17v2M17.5 17v2" />
  ),
  // A fork that used to lift pallets, carrying a decision.
  fenwick: <path d="M6 3v16h14M6 15h10M13 6l3 3-3 3-3-3z" />,
  // A door, and one way through it.
  ostium: <path d="M5 3h9v18H5zM10 12h10M17 9l3 3-3 3" />,
  volute: <path d={SPIRAL} />,
  sept: (
    <>
      <circle cx={12} cy={12} r={9} />
      <path d="M8.5 7.5h7L11 17M9.5 12.5h4" />
    </>
  ),
  // An aside: a bubble, and what was said in it.
  aparte: (
    <>
      <path d="M4 5h16v10H11l-4 3.5V15H4z" />
      <path d="M9 10h.01M12 10h.01M15 10h.01" strokeWidth={2.4} />
    </>
  ),
  spacers: (
    <>
      <path d="M12 2.5c3 2.2 4.2 6.2 3.2 11.5H8.8C7.8 8.7 9 4.7 12 2.5zM8.8 14l-2.3 3.5h3.3M15.2 14l2.3 3.5h-3.3M11 18.5v2.5M13 18.5v2.5" />
      <circle cx={12} cy={8.5} r={1.4} />
    </>
  ),
  // The city's eye.
  blume: (
    <>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zM2.5 20h19M2.5 4h19" />
      <circle cx={12} cy={12} r={2.8} />
    </>
  ),
  aperture: (
    <>
      <circle cx={12} cy={12} r={9} />
      <path d={polygon(6, 4, 0) + IRIS} />
    </>
  ),
  // A shelter's door, its wheel and its bolts.
  vault: (
    <>
      <circle cx={12} cy={12} r={9} />
      <circle cx={12} cy={12} r={2.2} />
      <path
        d={[0, 120, 240]
          .map((a) => through([polar(2.2, a), polar(6.2, a)]))
          .concat([45, 135, 225, 315].map((a) => through([polar(7.4, a), polar(8.2, a)])))
          .join("")}
      />
    </>
  ),
  abstergo: <path d={HELIX} />,
  // The light on an android's temple.
  cyberlife: (
    <>
      <circle cx={12} cy={12} r={8.5} />
      <circle cx={12} cy={12} r={4} />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </>
  ),
  // A company moon.
  hyperion: <path d="M15 3.5a8.5 8.5 0 1 0 5.5 13.8A7 7 0 1 1 15 3.5zM16 9.5v-3M14.5 6.5h3" />,
  umbrella: (
    <path d="M3 12a9 9 0 0 1 18 0c-1-1-2-1-3 0-1-1-2-1-3 0-1-1-2-1-3 0-1-1-2-1-3 0-1-1-2-1-3 0-1-1-2-1-3 0zM12 12v7a2 2 0 0 1-4 0M12 3v-1" />
  ),
  blackmesa: (
    <>
      <path d="M2.5 19h19M4.5 19l3-8h9l3 8M9.5 11l1-3h3l1 3" />
      <circle cx={18} cy={5.5} r={1.8} />
    </>
  ),
  // Three stations, stacked in orbit.
  trioptimum: <path d="M5 6l7 4 7-4M5 11l7 4 7-4M5 16l7 4 7-4" />,
  // A gate that should have stayed shut, under another planet's sky.
  uac: (
    <>
      <path d="M2.5 20h19M7.5 20v-7a4.5 4.5 0 0 1 9 0v7M10 20v-6a2 2 0 0 1 4 0v6" />
      <circle cx={18.5} cy={4.5} r={1.8} />
    </>
  ),
  // A machine's single eye.
  faro: (
    <>
      <path d={polygon(6, 9)} />
      <circle cx={12} cy={12} r={3.2} />
      <circle cx={12} cy={12} r={0.8} />
    </>
  ),
  // An arm nobody asked for.
  sarif: (
    <>
      <circle cx={6} cy={6} r={2.2} />
      <circle cx={11.5} cy={13} r={1.5} />
      <path d="M7.4 7.7l3.2 4.1M12.9 13.6l5.1 2M18 15.6l2.5-2.5M18 15.6l1.5 3.3" />
    </>
  ),
  // Every node talks to every other, and to nobody else.
  skynet: (
    <>
      {(
        [
          [12, 4],
          [4.5, 17],
          [19.5, 17],
          [12, 12.5],
        ] as const
      ).map(([x, y]) => (
        <circle key={`${x}:${y}`} cx={x} cy={y} r={1.7} />
      ))}
      <path d="M11.2 5.5l-5.9 10M12.8 5.5l5.9 10M6.2 17h11.6M12 5.7v5.1M10.6 13.4l-4.4 2.8M13.4 13.4l4.4 2.8" />
    </>
  ),
  // A reactor's worth of lightning, in a frame.
  shinra: <path d={`${polygon(6, 9, 0)}M13.5 5.5l-4.5 7.5h4l-2 5.5 5-8h-4z`} />,
  // A tower nobody comes down from.
  arasaka: (
    <path d="M3.5 21h17M9 21V6.5l3-3.5 3 3.5V21M5.5 21v-9H9M15 12h3.5v9M11 9h2M11 12.5h2M11 16h2" />
  ),
};

export function CompanyLogo({ id, className }: { id: CompetitorId; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-6 shrink-0", className)}
    >
      {MARKS[id]}
    </svg>
  );
}
