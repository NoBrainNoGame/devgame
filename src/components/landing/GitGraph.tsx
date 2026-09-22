import { cn } from "@/lib/utils";

/**
 * The pitch in one glyph.
 *
 * `main` runs down the middle. A feature branch leaves it and merges back — the
 * skill you went and fetched. A hotfix drops out to the left and does not come
 * back the same way. The branch you took to get stronger is the branch that
 * kept you from shipping.
 *
 * Same shape and same palette as the canvas draws during a run, so the page and
 * the game look like one thing. Decorative — the prose beside it carries the
 * meaning — so it is hidden from assistive technology.
 */
export function GitGraph({ className }: { className?: string }): React.JSX.Element {
  const main = [24, 72, 120, 168, 216, 264, 312];

  return (
    <svg
      viewBox="0 0 260 336"
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto", className)}
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      {/* main */}
      <path d="M120 16 V324" className="stroke-branch-main" />

      {/* a feature branch that leaves at 120 and merges back at 264 */}
      <path
        d="M120 120 C156 120 156 144 192 144 V216 C156 216 156 264 120 264"
        className="stroke-branch-feature"
      />

      {/* a hotfix, spliced in on the left and walked in one direction */}
      <path d="M120 168 C84 168 84 192 48 192" className="stroke-branch-hotfix" />

      {main.map((cy) => (
        <circle
          key={cy}
          cx={120}
          cy={cy}
          r={6}
          className={
            cy <= 120 ? "fill-branch-main stroke-branch-main" : "fill-bg stroke-branch-main"
          }
        />
      ))}
      {[144, 216].map((cy) => (
        <circle key={cy} cx={192} cy={cy} r={6} className="fill-bg stroke-branch-feature" />
      ))}
      <circle cx={48} cy={192} r={6} className="fill-bg stroke-branch-hotfix" />

      {/* where you are: the node you have not resolved yet */}
      <circle cx={120} cy={168} r={11} className="fill-none stroke-2 stroke-white" />
    </svg>
  );
}
