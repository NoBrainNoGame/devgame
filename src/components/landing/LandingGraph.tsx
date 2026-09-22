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
 * the screen reader get.
 */
const LandingCanvas = dynamic(
  () => import("@/components/landing/LandingCanvas").then((module) => module.LandingCanvas),
  { ssr: false, loading: () => <Skeleton className="size-full rounded-lg" /> },
);

export function LandingGraph({ className }: { className?: string }): React.JSX.Element {
  const t = useTranslations("landing");

  return (
    <figure className={cn("space-y-2", className)}>
      <div className="h-[30rem] w-full overflow-hidden rounded-lg border border-line bg-bg">
        <LandingCanvas label={t("graphLabel")} />
      </div>
      <figcaption className="text-center text-muted-foreground text-xs">
        {t("graphHint")}
      </figcaption>
    </figure>
  );
}
