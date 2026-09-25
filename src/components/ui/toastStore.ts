import type { ReactNode } from "react";
import { createStore } from "zustand/vanilla";

/**
 * The toasts on screen, managed like an OS's windows: each can be minimised
 * to a one-line chip in a tray, restored, or closed, and all of them at once.
 * A toast stays until it is dealt with — its close button, its action, or the
 * code that dismisses it once its cause is gone.
 */

export type NotifyTone = "success" | "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastEntry {
  id: string;
  tone: NotifyTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ToastAction;
  minimized: boolean;
}

export type ToastInput = Omit<ToastEntry, "id" | "minimized"> & { id?: string };

interface ToastState {
  toasts: ToastEntry[];
}

export const toastStore = createStore<ToastState>()(() => ({ toasts: [] }));

let serial = 0;

/**
 * Shows a toast, newest first. A toast with the id of one already up replaces
 * it in place and keeps its state: an alert the player has minimised stays
 * minimised when its figures change.
 */
export function pushToast(input: ToastInput): string {
  const { id: given, ...content } = input;
  serial += 1;
  const id = given ?? `toast-${serial}`;
  toastStore.setState(({ toasts }) => {
    const held = toasts.find((toast) => toast.id === id);
    if (held !== undefined) {
      return {
        toasts: toasts.map((toast) =>
          toast.id === id ? { id, minimized: toast.minimized, ...content } : toast,
        ),
      };
    }
    return { toasts: [{ id, minimized: false, ...content }, ...toasts] };
  });
  return id;
}

/** Closes one toast, or every toast. */
export function dismissToast(id?: string): void {
  toastStore.setState(({ toasts }) => ({
    toasts: id === undefined ? [] : toasts.filter((toast) => toast.id !== id),
  }));
}

export function setMinimized(id: string, minimized: boolean): void {
  toastStore.setState(({ toasts }) => ({
    toasts: toasts.map((toast) => (toast.id === id ? { ...toast, minimized } : toast)),
  }));
}

export function minimizeAll(): void {
  toastStore.setState(({ toasts }) => ({
    toasts: toasts.map((toast) => ({ ...toast, minimized: true })),
  }));
}
