"use client";

import { useTranslations } from "next-intl";

import { useMoney } from "@/components/hud/useGameText";
import type { FinanceMonth } from "@/game";

/**
 * The paydays as a curve, on a log scale: an incremental's money is read in
 * orders of magnitude, and a decade a tier draws as a straight climb rather
 * than a hockey stick with every early month flattened to nothing. Cash is
 * the area, revenue the line, a saturated month a red dot, a tier reached a
 * dashed rule. Inline SVG, no library: a dozen numbers a month is not a
 * charting problem.
 */

const WIDTH = 640;
const HEIGHT = 140;
const PAD = { top: 10, right: 8, bottom: 16, left: 40 };

function log10(value: number): number {
  return Math.log10(Math.max(1, value));
}

export function FinanceChart({ history }: { history: FinanceMonth[] }) {
  const t = useTranslations("hud");
  const money = useMoney();

  if (history.length < 2) {
    return <p className="text-muted-foreground text-xs">{t("financeEmpty")}</p>;
  }

  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const top = Math.ceil(Math.max(...history.map((m) => log10(Math.max(m.money, m.mrr)))));
  const yTop = Math.max(2, top);
  const x = (index: number): number =>
    PAD.left + (index / Math.max(1, history.length - 1)) * innerWidth;
  const y = (value: number): number => PAD.top + innerHeight - (log10(value) / yTop) * innerHeight;

  const first = history[0];
  const last = history[history.length - 1];
  if (first === undefined || last === undefined) return null;

  const moneyLine = history.map((m, i) => `${x(i).toFixed(1)},${y(m.money).toFixed(1)}`);
  const area = `M${x(0).toFixed(1)},${(PAD.top + innerHeight).toFixed(1)} L${moneyLine.join(" L")} L${x(history.length - 1).toFixed(1)},${(PAD.top + innerHeight).toFixed(1)} Z`;
  const mrrLine = history.map((m, i) => `${x(i).toFixed(1)},${y(m.mrr).toFixed(1)}`).join(" L");
  const decades = Array.from({ length: yTop + 1 }, (_, k) => k);
  const tierRises = history.flatMap((m, i) => {
    const previous = history[i - 1];
    return previous !== undefined && m.tier > previous.tier ? [{ index: i, tier: m.tier }] : [];
  });

  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={t("financeChart")}
      >
        <title>{t("financeChart")}</title>
        {decades.map((k) => (
          <g key={k}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(10 ** k)}
              y2={y(10 ** k)}
              className="stroke-line"
              strokeWidth={0.5}
            />
            <text
              x={PAD.left - 4}
              y={y(10 ** k) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={8}
            >
              {money(10 ** k)}
            </text>
          </g>
        ))}
        {tierRises.map((rise) => (
          <g key={rise.index}>
            <line
              x1={x(rise.index)}
              x2={x(rise.index)}
              y1={PAD.top}
              y2={PAD.top + innerHeight}
              className="stroke-branch-feature"
              strokeWidth={0.75}
              strokeDasharray="2 2"
            />
            <text
              x={x(rise.index) + 2}
              y={PAD.top + 8}
              className="fill-branch-feature"
              fontSize={8}
            >
              {t("chartTier")} {rise.tier}
            </text>
          </g>
        ))}
        <path d={area} className="fill-branch-main/20" />
        <path
          d={`M${moneyLine.join(" L")}`}
          className="stroke-branch-main"
          fill="none"
          strokeWidth={1.25}
        />
        <path d={`M${mrrLine}`} className="stroke-energy" fill="none" strokeWidth={1} />
        {history.map((m, i) =>
          m.outage ? (
            <circle key={m.month} cx={x(i)} cy={y(m.mrr)} r={2} className="fill-branch-hotfix" />
          ) : null,
        )}
        <text x={PAD.left} y={HEIGHT - 4} className="fill-muted-foreground" fontSize={8}>
          {t("monthCount", { month: first.month })}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 4}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={8}
        >
          {t("monthCount", { month: last.month })}
        </text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-3 text-muted-foreground text-xs">
        <span className="text-branch-main">▬ {t("chartMoney")}</span>
        <span className="text-energy">— {t("chartMrr")}</span>
        <span className="text-branch-hotfix">● {t("chartOutage")}</span>
        <span className="text-branch-feature">┆ {t("chartTier")}</span>
      </figcaption>
    </figure>
  );
}
