import { TextStyle } from "pixi.js";

import { THEME } from "@/game/render/theme";

/**
 * Everything on the canvas is monospaced, to match the site. The family list
 * mirrors the one `globals.css` sets, so a node label and a HUD label look
 * like the same typeface.
 */
const MONO = ['"JetBrains Mono"', "ui-monospace", '"SF Mono"', "Menlo", "monospace"].join(", ");

export const glyphStyle = new TextStyle({
  fontFamily: MONO,
  fontSize: 13,
  fill: THEME.text,
  align: "center",
});

export const labelStyle = new TextStyle({
  fontFamily: MONO,
  fontSize: 11,
  fill: THEME.textMuted,
});

export const cursorStyle = new TextStyle({
  fontFamily: MONO,
  fontSize: 11,
  fill: THEME.text,
});

export const floatingStyle = new TextStyle({
  fontFamily: MONO,
  fontSize: 14,
  fontWeight: "bold",
  fill: THEME.text,
});
