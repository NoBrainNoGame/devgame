"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  type LucideIcon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Every toast in the app, in the game's frame: the cut corner, a bar and a
 * glow in the colour of what it says, the display face for the title.
 *
 * A toast stays until it is dealt with — its close button, its action, or
 * the code that dismisses it once its cause is gone — because an alert that
 * fades while the player is looking at the graph is an alert nobody read.
 * Warnings and errors keep pulsing until then.
 */

export type NotifyTone = "success" | "info" | "warning" | "error";

export interface NotifyOptions {
  description?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    /** Leave the toast up after the action: it closes when its cause does. */
    keepOpen?: boolean;
  };
  /** A toast with the same id is replaced in place rather than stacked. */
  id?: string;
}

const ICONS: Record<NotifyTone, LucideIcon> = {
  success: CircleCheckIcon,
  info: InfoIcon,
  warning: TriangleAlertIcon,
  error: OctagonXIcon,
};

function show(tone: NotifyTone, title: ReactNode, options: NotifyOptions = {}): string | number {
  const { id, ...rest } = options;
  return toast.custom(
    (toastId) => <CyberToast toastId={toastId} tone={tone} title={title} {...rest} />,
    {
      duration: Number.POSITIVE_INFINITY,
      ...(id === undefined ? {} : { id }),
    },
  );
}

export const notify = {
  success: (title: ReactNode, options?: NotifyOptions) => show("success", title, options),
  info: (title: ReactNode, options?: NotifyOptions) => show("info", title, options),
  warning: (title: ReactNode, options?: NotifyOptions) => show("warning", title, options),
  error: (title: ReactNode, options?: NotifyOptions) => show("error", title, options),
  dismiss: (id?: string | number) => toast.dismiss(id),
};

function CyberToast({
  toastId,
  tone,
  title,
  description,
  action,
}: {
  toastId: string | number;
  tone: NotifyTone;
  title: ReactNode;
  description?: ReactNode;
  action?: NotifyOptions["action"];
}) {
  const common = useTranslations("common");
  const Icon = ICONS[tone];
  const urgent = tone === "warning" || tone === "error";

  return (
    <div data-tone={tone} className="cyber-toast">
      <div
        role={urgent ? "alert" : "status"}
        className="cyber-frame cyber-flicker-in relative flex w-[min(calc(100vw-2rem),26rem)] items-start gap-3 py-3 pr-10 pl-5 text-sm [--cyber-corner:14px]"
      >
        <span aria-hidden="true" className="cyber-toast-bar" />
        <Icon className="mt-0.5 size-5 shrink-0 text-(--tone)" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-display font-semibold text-(--tone) uppercase tracking-[0.08em]">
            {title}
          </p>
          {description === undefined ? null : (
            <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
          )}
          {action === undefined ? null : (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                action.onClick();
                if (action.keepOpen !== true) toast.dismiss(toastId);
              }}
            >
              {action.label}
            </Button>
          )}
        </div>
        <button
          type="button"
          aria-label={common("close")}
          className="absolute top-2 right-2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--tone)"
          onClick={() => toast.dismiss(toastId)}
        >
          <XIcon className="size-4" />
        </button>
        <span aria-hidden="true" className="cyber-corner" />
      </div>
    </div>
  );
}
