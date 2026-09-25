"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * How many modal dialogs are open, anywhere on the page. Every dialog goes
 * through `DialogContent`, which counts itself in and out, so a page that
 * cares — the run pauses its canvas while one is open — asks here instead
 * of tracking each dialog's own state.
 */
const modals = createStore<{ open: number }>()(() => ({ open: 0 }));

export function modalOpened(): () => void {
  modals.setState((state) => ({ open: state.open + 1 }));
  return () => modals.setState((state) => ({ open: Math.max(0, state.open - 1) }));
}

export function useModalsOpen(): number {
  return useStore(modals, (state) => state.open);
}
