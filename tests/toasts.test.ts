import { beforeEach, describe, expect, test } from "bun:test";

import {
  dismissToast,
  minimizeAll,
  pushToast,
  setMinimized,
  toastStore,
} from "@/components/ui/toastStore";

const ids = (): string[] => toastStore.getState().toasts.map((toast) => toast.id);

describe("the toast manager", () => {
  beforeEach(() => dismissToast());

  test("newest first, and an id already up is replaced in place", () => {
    pushToast({ tone: "info", title: "first", id: "a" });
    pushToast({ tone: "info", title: "second", id: "b" });
    expect(ids()).toEqual(["b", "a"]);
    pushToast({ tone: "error", title: "first again", id: "a" });
    expect(ids()).toEqual(["b", "a"]);
    expect(toastStore.getState().toasts[1]?.title).toBe("first again");
  });

  test("a minimised toast stays minimised when its alert fires again", () => {
    pushToast({ tone: "warning", title: "servers", id: "capacity" });
    setMinimized("capacity", true);
    pushToast({ tone: "error", title: "servers, worse", id: "capacity" });
    expect(toastStore.getState().toasts[0]?.minimized).toBe(true);
    setMinimized("capacity", false);
    expect(toastStore.getState().toasts[0]?.minimized).toBe(false);
  });

  test("all of them minimise, or close, at once; one closes alone", () => {
    const one = pushToast({ tone: "success", title: "one" });
    pushToast({ tone: "success", title: "two" });
    minimizeAll();
    expect(toastStore.getState().toasts.every((toast) => toast.minimized)).toBe(true);
    dismissToast(one);
    expect(ids()).toHaveLength(1);
    dismissToast();
    expect(ids()).toEqual([]);
  });
});
