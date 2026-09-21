import { ImageResponse } from "next/og";

import { THEME } from "@/game/render/theme";

/**
 * The favicon: a commit on a branch, which is the whole game in sixteen pixels.
 * Generated so it cannot drift from the palette the canvas uses.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon(): ImageResponse {
  const hex = (value: number): string => `#${value.toString(16).padStart(6, "0")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hex(THEME.background),
        borderRadius: 6,
      }}
    >
      {/* Labelled rather than titled: the icon is rasterised, and a <title>
          would draw as words inside a 32-pixel square. */}
      <svg
        role="img"
        aria-label="Devgame"
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
      >
        <path d="M16 3 V29" stroke={hex(THEME.lane.trunk)} />
        <path d="M16 12 C22 12 22 20 27 20" stroke={hex(THEME.lane.feature)} />
        <circle cx="16" cy="12" r="5" fill={hex(THEME.lane.trunk)} />
      </svg>
    </div>,
    size,
  );
}
