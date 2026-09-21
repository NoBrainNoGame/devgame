import { ImageResponse } from "next/og";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";

import { THEME } from "@/game/render/theme";
import { routing } from "@/i18n/routing";

/**
 * The card people see before they see the site.
 *
 * Generated rather than drawn: the one thing worth showing is the git graph,
 * and the graph is already a handful of lines and circles in the project's own
 * palette. An exported PNG would be a second copy of the colours to keep in
 * step with `theme.ts` — and it would go stale the moment the tagline changed.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Devgame";

export default async function OpenGraphImage({
  params,
}: {
  params: { locale: string };
}): Promise<ImageResponse> {
  const locale = hasLocale(routing.locales, params.locale) ? params.locale : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "landing" });

  const hex = (value: number): string => `#${value.toString(16).padStart(6, "0")}`;
  const mono = await monoFont();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: hex(THEME.background),
        padding: 72,
        fontFamily: mono === null ? "monospace" : "JetBrains Mono",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 96, color: "#ffffff", letterSpacing: -2 }}>{t("ogTitle")}</div>
        <div style={{ fontSize: 38, color: hex(THEME.lane.trunk) }}>{t("ogSubtitle")}</div>
      </div>

      <Graph
        trunk={hex(THEME.lane.trunk)}
        feature={hex(THEME.lane.feature)}
        hotfix={hex(THEME.lane.hotfix)}
        bot={hex(THEME.bot)}
      />
    </div>,
    { ...size, ...(mono === null ? {} : { fonts: [mono] }) },
  );
}

/**
 * The site is set in JetBrains Mono, and a share card in a different typeface
 * looks like somebody else's site.
 *
 * Satori needs the font as bytes and has no monospace of its own, so it is
 * fetched. Wrapped because a share card is not worth failing a page render
 * over: if the fetch fails the card still draws, in whatever Satori falls back
 * to, and the graph — which is the part that carries the meaning — is
 * unaffected.
 */
async function monoFont(): Promise<{
  name: string;
  data: ArrayBuffer;
  weight: 400;
  style: "normal";
} | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(3000) },
    ).then((response) => response.text());

    const url = /src: url\((https:[^)]+)\)/.exec(css)?.[1];
    if (url === undefined) return null;

    const data = await fetch(url, { signal: AbortSignal.timeout(3000) }).then((response) =>
      response.arrayBuffer(),
    );

    return { name: "JetBrains Mono", data, weight: 400, style: "normal" };
  } catch {
    return null;
  }
}

/**
 * Inline SVG rather than JSX boxes: `ImageResponse` supports a subset of CSS,
 * and curves are not in it.
 */
function Graph({
  trunk,
  feature,
  hotfix,
  bot,
}: {
  trunk: string;
  feature: string;
  hotfix: string;
  bot: string;
}): React.JSX.Element {
  return (
    /* Labelled rather than titled: this SVG is rasterised into a PNG, so a
       <title> would draw as visible words on the card. The card's real
       alternative text is the `alt` export above. */
    <svg
      role="img"
      aria-label={alt}
      width="1056"
      height="220"
      viewBox="0 0 1056 220"
      fill="none"
      strokeWidth="6"
      strokeLinecap="round"
    >
      <path d="M24 130 H1032" stroke={trunk} />
      <path d="M300 130 C348 130 348 44 396 44 H612 C660 44 660 130 684 130" stroke={feature} />
      <path d="M684 130 C732 130 732 58 780 58" stroke={hotfix} />
      <path
        d="M120 130 C168 130 168 200 216 200 H768 C816 200 816 130 864 130"
        stroke={bot}
        strokeDasharray="12 16"
      />
      {[120, 300, 492, 684, 864, 1008].map((cx) => (
        <circle key={cx} cx={cx} cy={130} r={13} fill={trunk} />
      ))}
      {[396, 612].map((cx) => (
        <circle key={cx} cx={cx} cy={44} r={13} fill={feature} />
      ))}
      <circle cx={780} cy={58} r={13} fill={hotfix} />
      {[216, 768].map((cx) => (
        <circle key={cx} cx={cx} cy={200} r={11} fill={bot} />
      ))}
    </svg>
  );
}
