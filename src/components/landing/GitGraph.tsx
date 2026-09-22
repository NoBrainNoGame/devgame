import { cn } from "@/lib/utils";

/**
 * The pitch in one glyph: a sprint of the actual game, drawn the way the
 * canvas draws it.
 *
 * Same lanes, same palette, same shapes as `render/`: `main` and `dev` run the
 * whole height, a feature column forks off `dev` and merges back, a hotfix
 * forced by production does the same on its own column, the machine's commits
 * are purple with an unread ring, the review's flag is a red ring, and the
 * refs sit in a gutter before the subjects — a git client, not a diagram.
 *
 * Newest row on top, as in the run. Decorative — the prose beside it carries
 * the meaning — so it is hidden from assistive technology.
 */

const LANE_X = { main: 34, dev: 68, feat: 102, fix: 136 } as const;
const ROW = 36;
const TOP = 26;
const REF_X = 166;
const SUBJECT_X = 250;
const WIDTH = 400;

/** A pill's width for its text, so two refs on a row sit side by side. */
const refWidth = (text: string): number => text.length * 6.6 + 10;

type Kind = "release" | "merge" | "craft" | "ai" | "unread" | "bugged" | "hotfix" | "init";

interface Row {
  id: string;
  lane: keyof typeof LANE_X;
  kind: Kind;
  refs?: { text: string; tone: "main" | "dev" | "feature" | "hotfix" | "head" }[];
}

/**
 * Top to bottom: what the run looked like at the end of its first sprint. The
 * subjects come from the page, translated, one per row.
 */
const ROWS: Row[] = [
  { id: "release", lane: "main", kind: "release", refs: [{ text: "main", tone: "main" }] },
  { id: "ship", lane: "main", kind: "merge" },
  {
    id: "merge-fix",
    lane: "dev",
    kind: "merge",
    refs: [
      { text: "dev", tone: "dev" },
      { text: "HEAD", tone: "head" },
    ],
  },
  { id: "fix-2", lane: "fix", kind: "hotfix" },
  { id: "merge-feat", lane: "dev", kind: "merge" },
  { id: "fix-flagged", lane: "feat", kind: "craft" },
  { id: "ai-bugged", lane: "feat", kind: "bugged" },
  { id: "fix-1", lane: "fix", kind: "hotfix" },
  { id: "ai-unread", lane: "feat", kind: "unread" },
  { id: "craft", lane: "feat", kind: "craft" },
  { id: "init", lane: "dev", kind: "init" },
];

export const GRAPH_ROWS = ROWS.length;

const y = (row: number): number => TOP + row * ROW;

/** A lane's own colour, as the theme gives it. */
const LANE_CLASS: Record<keyof typeof LANE_X, string> = {
  main: "stroke-branch-main",
  dev: "stroke-branch-dev",
  feat: "stroke-branch-feature",
  fix: "stroke-branch-hotfix",
};

const REF_CLASS = {
  main: "stroke-branch-main fill-branch-main",
  dev: "stroke-branch-dev fill-branch-dev",
  feature: "stroke-branch-feature fill-branch-feature",
  hotfix: "stroke-branch-hotfix fill-branch-hotfix",
  head: "stroke-white fill-white",
} as const;

/** A bend from one lane to another between two rows, the way the canvas draws a fork. */
function bend(from: keyof typeof LANE_X, fromRow: number, to: keyof typeof LANE_X, toRow: number) {
  const x1 = LANE_X[from];
  const x2 = LANE_X[to];
  const y1 = y(fromRow);
  const y2 = y(toRow);
  const mid = (y1 + y2) / 2;
  return `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
}

export function GitGraph({
  subjects,
  className,
}: {
  /** One conventional-commit subject per row, newest first. */
  subjects: readonly string[];
  className?: string;
}): React.JSX.Element {
  const last = ROWS.length - 1;
  const height = y(last) + TOP;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto", className)}
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <title>Git graph</title>

      {/* The two long-lived lanes, full height. */}
      <path d={`M${LANE_X.main} ${y(0)} V${y(last)}`} className="stroke-branch-main opacity-80" />
      <path d={`M${LANE_X.dev} ${y(0)} V${y(last)}`} className="stroke-branch-dev opacity-80" />

      {/* The feature: forks off dev at the bottom, lives in its column, merges back. */}
      <path d={bend("dev", 10, "feat", 9)} className="stroke-branch-feature" />
      <path d={`M${LANE_X.feat} ${y(9)} V${y(5)}`} className="stroke-branch-feature" />
      <path d={bend("feat", 5, "dev", 4)} className="stroke-branch-feature" />

      {/* The hotfix production forced open, in its own column. */}
      <path d={bend("dev", 10, "fix", 7)} className="stroke-branch-hotfix" />
      <path d={`M${LANE_X.fix} ${y(7)} V${y(3)}`} className="stroke-branch-hotfix" />
      <path d={bend("fix", 3, "dev", 2)} className="stroke-branch-hotfix" />

      {/* dev shipped into main, then tagged. */}
      <path d={bend("dev", 2, "main", 1)} className="stroke-branch-dev" />

      {ROWS.map((row, index) => (
        <Node key={row.id} x={LANE_X[row.lane]} y={y(index)} kind={row.kind} lane={row.lane} />
      ))}

      {/* Refs in the gutter, subjects after them: a git log, not a legend. */}
      {ROWS.map((row, index) => (
        <g key={row.id}>
          {(row.refs ?? []).map((ref, position, refs) => (
            <Ref
              key={ref.text}
              x={REF_X + refs.slice(0, position).reduce((sum, r) => sum + refWidth(r.text) + 6, 0)}
              y={y(index)}
              text={ref.text}
              tone={ref.tone}
            />
          ))}
          <text
            x={SUBJECT_X}
            y={y(index) + 4}
            className="fill-muted-foreground font-mono text-[11px]"
            stroke="none"
          >
            {subjects[index] ?? ""}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Node({
  x,
  y,
  kind,
  lane,
}: {
  x: number;
  y: number;
  kind: Kind;
  lane: keyof typeof LANE_X;
}): React.JSX.Element {
  const laneStroke = LANE_CLASS[lane];

  switch (kind) {
    case "release":
      return (
        <g>
          <circle cx={x} cy={y} r={9} className="fill-bg stroke-branch-main" />
          <circle cx={x} cy={y} r={4} className="fill-branch-main stroke-branch-main" />
        </g>
      );
    case "merge":
      return <circle cx={x} cy={y} r={7} className={cn("fill-bg", laneStroke)} />;
    case "init":
      return <circle cx={x} cy={y} r={6} className="fill-branch-dev stroke-branch-dev" />;
    case "craft":
      return <circle cx={x} cy={y} r={6} className="fill-branch-main stroke-branch-main" />;
    case "hotfix":
      return <circle cx={x} cy={y} r={6} className="fill-branch-hotfix stroke-branch-hotfix" />;
    case "ai":
      return <circle cx={x} cy={y} r={6} className="fill-ai stroke-ai" />;
    case "unread":
      return (
        <g>
          <circle cx={x} cy={y} r={6} className="fill-ai stroke-ai" />
          <circle cx={x} cy={y} r={10} className="fill-none stroke-debt" strokeWidth="1.5" />
        </g>
      );
    case "bugged":
      return (
        <g>
          <circle cx={x} cy={y} r={6} className="fill-ai stroke-ai" />
          <circle cx={x} cy={y} r={10} className="fill-none stroke-branch-hotfix" strokeWidth="2" />
        </g>
      );
  }
}

function Ref({
  x,
  y,
  text,
  tone,
}: {
  x: number;
  y: number;
  text: string;
  tone: keyof typeof REF_CLASS;
}): React.JSX.Element {
  const width = refWidth(text);
  return (
    <g>
      <rect
        x={x}
        y={y - 8}
        width={width}
        height={16}
        rx={4}
        className={cn("fill-bg", REF_CLASS[tone].split(" ")[0])}
        strokeWidth="1.25"
      />
      <text
        x={x + width / 2}
        y={y + 3.5}
        textAnchor="middle"
        className={cn("font-mono text-[9.5px]", REF_CLASS[tone].split(" ")[1])}
        stroke="none"
      >
        {text}
      </text>
    </g>
  );
}
