"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The run on the landing page, in the game's own canvas.
 *
 * Pixi touches `window` at import, so the canvas is a client-only island the
 * page renders a placeholder for; the pitch beside it is what the crawler and
 * the screen reader get. No frame and no caption: the canvas shares the
 * page's background and its edges dissolve into it, so the graph reads as
 * part of the hero rather than as a screenshot pinned beside it.
 */
const LandingCanvas = dynamic(
  () => import("@/components/landing/LandingCanvas").then((module) => module.LandingCanvas),
  { ssr: false, loading: () => <Skeleton className="landing-graph size-full opacity-40" /> },
);

export function LandingGraph({
  seed,
  className,
}: {
  /** Today's seed, read on the server. */
  seed: string;
  className?: string;
}): React.JSX.Element {
  const t = useTranslations("landing");

  return (
    <div className={cn("h-[24rem] w-full overflow-hidden sm:h-[30rem] lg:h-[34rem]", className)}>
      <LandingCanvas label={t("graphLabel")} seed={seed} playerName={t("you")} />
    </div>
  );
}
