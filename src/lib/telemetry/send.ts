"use client";

import { idleStore } from "@/components/hud/idleStore";
import type { RunSaveDto } from "@/game";
import type { RunSampleInput } from "@/lib/telemetry/schema";

/**
 * Sends a run to the balancing table. Fire and forget: the answer is always
 * 204 and nothing here reads it. What goes is the save the game already
 * keeps, the moment, the tab's time on the run and the idle clock's
 * settings — nothing about the person.
 */
export function sendRunSample(
  save: RunSaveDto,
  kind: RunSampleInput["kind"],
  locale: string,
  sessionMs: number,
): void {
  const { settings } = idleStore.getState();
  const body: RunSampleInput = {
    save,
    kind,
    locale: locale as RunSampleInput["locale"],
    sessionMs: Math.max(0, Math.round(sessionMs)),
    idle: { enabled: settings.enabled, speed: settings.speed },
  };
  void fetch("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
