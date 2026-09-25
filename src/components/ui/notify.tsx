"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  type LucideIcon,
  MinusIcon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import {
  dismissToast,
  minimizeAll,
  type NotifyTone,
  pushToast,
  setMinimized,
  type ToastAction,
  type ToastEntry,
  toastStore,
} from "@/components/ui/toastStore";
import { cn } from "@/lib/utils";

/**
 * Every toast in the app, in the game's frame — the cut corner, a bar and a
 * glow in the colour of what it says, the display face for the title — and
 * managed like windows (`toastStore`). Each has a title bar that minimises it
 * to a chip in the tray above the stack, or closes it; with two or more up, a
 * toolbar minimises or closes them all. Pressing a toast's action closes it:
 * it has been dealt with. Warnings and errors keep pulsing until then, even
 * minimised.
 */

export type { NotifyTone };

export interface NotifyOptions {
  description?: ReactNode;
  action?: ToastAction;
  /** A toast with the same id is replaced in place rather than stacked. */
  id?: string;
}

const ICONS: Record<NotifyTone, LucideIcon> = {
  success: CircleCheckIcon,
  info: InfoIcon,
  warning: TriangleAlertIcon,
  error: OctagonXIcon,
};

function show(tone: NotifyTone, title: ReactNode, options: NotifyOptions = {}): string {
  return pushToast({ tone, title, ...options });
}

export const notify = {
  success: (title: ReactNode, options?: NotifyOptions) => show("success", title, options),
  info: (title: ReactNode, options?: NotifyOptions) => show("info", title, options),
  warning: (title: ReactNode, options?: NotifyOptions) => show("warning", title, options),
  error: (title: ReactNode, options?: NotifyOptions) => show("error", title, options),
  dismiss: (id?: string) => dismissToast(id),
};

/**
 * Where toasts land: top centre, under the header — and on the run's page
 * under its bars, which write their bottom edge to `--toast-top` — over the
 * graph: the one place that hides no control and that the eye crosses every
 * turn. Under the dialogs: a modal is the player's focus, and a toast over it
 * would hide what it asks. Mounted once, in the locale layout.
 */
export function ToastManager() {
  const t = useTranslations("toasts");
  const toasts = useStore(toastStore, (state) => state.toasts);
  if (toasts.length === 0) return null;

  const minimized = toasts.filter((toast) => toast.minimized);
  const open = toasts.filter((toast) => !toast.minimized);

  return (
    <section
      aria-label={t("label")}
      className="pointer-events-none fixed inset-x-0 top-[var(--toast-top,4.5rem)] z-40 flex flex-col items-center gap-2 px-4"
    >
      {toasts.length > 1 ? (
        <div className="pointer-events-auto flex items-center gap-1 border border-line bg-panel/90 py-0.5 pr-0.5 pl-3 text-muted-foreground text-xs backdrop-blur-sm">
          <span className="mr-2 tabular-nums">{t("count", { count: toasts.length })}</span>
          {open.length > 0 ? (
            <Button size="xs" variant="ghost" onClick={minimizeAll}>
              <MinusIcon />
              {t("minimizeAll")}
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" onClick={() => dismissToast()}>
            <XIcon />
            {t("closeAll")}
          </Button>
        </div>
      ) : null}

      {minimized.length > 0 ? (
        <ul className="pointer-events-auto flex max-w-[min(calc(100vw-2rem),48rem)] flex-wrap justify-center gap-1.5">
          {minimized.map((toast) => (
            <li key={toast.id}>
              <ToastChip toast={toast} />
            </li>
          ))}
        </ul>
      ) : null}

      {open.map((toast) => (
        <ToastWindow key={toast.id} toast={toast} />
      ))}
    </section>
  );
}

/** A minimised toast: one line in its tone, a click restores it. */
function ToastChip({ toast }: { toast: ToastEntry }) {
  const t = useTranslations("toasts");
  const common = useTranslations("common");
  const Icon = ICONS[toast.tone];

  return (
    <div data-tone={toast.tone} className="cyber-toast cyber-toast-chip">
      <div className="cyber-frame cyber-flicker-in flex items-center text-xs [--cyber-corner:8px]">
        <button
          type="button"
          title={t("restore")}
          className="flex max-w-56 items-center gap-1.5 py-1 pr-1 pl-2 outline-none focus-visible:underline"
          onClick={() => setMinimized(toast.id, false)}
        >
          <Icon aria-hidden="true" className="size-3.5 shrink-0 text-(--tone)" />
          <span className="truncate font-display font-semibold text-(--tone) uppercase tracking-[0.08em]">
            {toast.title}
          </span>
        </button>
        <button
          type="button"
          aria-label={common("close")}
          className="p-1 pr-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--tone)"
          onClick={() => dismissToast(toast.id)}
        >
          <XIcon className="size-3.5" />
        </button>
        <span aria-hidden="true" className="cyber-corner" />
      </div>
    </div>
  );
}

function ToastWindow({ toast }: { toast: ToastEntry }) {
  const t = useTranslations("toasts");
  const common = useTranslations("common");
  const Icon = ICONS[toast.tone];
  const urgent = toast.tone === "warning" || toast.tone === "error";
  const { action } = toast;

  return (
    <div data-tone={toast.tone} className="cyber-toast pointer-events-auto">
      <div
        role={urgent ? "alert" : "status"}
        className="cyber-frame cyber-flicker-in relative flex w-[min(calc(100vw-2rem),26rem)] items-start gap-3 py-3 pr-16 pl-5 text-sm [--cyber-corner:14px]"
      >
        <span aria-hidden="true" className="cyber-toast-bar" />
        <Icon className="mt-0.5 size-5 shrink-0 text-(--tone)" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-display font-semibold text-(--tone) uppercase tracking-[0.08em]">
            {toast.title}
          </p>
          {toast.description === undefined ? null : (
            <p className="text-muted-foreground text-xs leading-relaxed">{toast.description}</p>
          )}
          {action === undefined ? null : (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                action.onClick();
                // Acted on is dealt with: the toast has said what it had to.
                dismissToast(toast.id);
              }}
            >
              {action.label}
            </Button>
          )}
        </div>
        <div className="absolute top-2 right-2 flex">
          <WindowButton label={t("minimize")} onClick={() => setMinimized(toast.id, true)}>
            <MinusIcon className="size-4" />
          </WindowButton>
          <WindowButton label={common("close")} onClick={() => dismissToast(toast.id)}>
            <XIcon className="size-4" />
          </WindowButton>
        </div>
        <span aria-hidden="true" className="cyber-corner" />
      </div>
    </div>
  );
}

function WindowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
        "focus-visible:outline-2 focus-visible:outline-(--tone)",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
