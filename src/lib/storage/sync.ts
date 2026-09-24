"use client";

import { type MetaProgressDto, type RunSaveDto, RunSaveSchema } from "@/game";
import { getMyProfile, syncMeta } from "@/lib/profile/actions";
import { mergeMeta } from "@/lib/profile/merge";
import { saveRun } from "@/lib/run/actions";
import { STORAGE_KEYS } from "@/lib/storage/keys";
import { readJson, remove, writeJson } from "@/lib/storage/local";
import type { SyncState } from "@/lib/storage/useMetaStore";

/**
 * Bringing a local save and a cloud save into agreement.
 *
 * The game is offline-first, so neither copy is authoritative and neither is a
 * cache of the other. `mergeMeta` decides, and it runs on both sides — see the
 * note there on why the result has to be something a player would call fair.
 *
 * Nothing in here is required for the game to work. If every call fails, the
 * player keeps playing against `localStorage` and nobody has a bad time.
 */

export interface SyncOutcome {
  meta: MetaProgressDto;
  state: SyncState;
}

export async function syncProgress(local: MetaProgressDto): Promise<SyncOutcome> {
  const profile = await getMyProfile();

  if (!profile.ok) {
    return { meta: local, state: profile.error.code === "unauthorized" ? "offline" : "error" };
  }

  // First sign-in on this account: the local progress becomes the cloud copy
  // rather than being thrown away for an empty one.
  if (profile.data === null) {
    const created = await syncMeta(local);
    return created.ok ? { meta: created.data, state: "synced" } : { meta: local, state: "error" };
  }

  const merged = mergeMeta(profile.data.meta, local);
  const pushed = await syncMeta(merged);
  if (pushed.ok) return { meta: pushed.data, state: "synced" };

  // Another device wrote in between. Re-read, merge once more, and stop there:
  // a loop here would be a loop against a device that is actively writing.
  if (pushed.error.code === "conflict") {
    const fresh = await getMyProfile();
    if (fresh.ok && fresh.data !== null) {
      const remerged = mergeMeta(fresh.data.meta, local);
      const retry = await syncMeta(remerged);
      if (retry.ok) return { meta: retry.data, state: "synced" };
      return { meta: remerged, state: "conflict" };
    }
  }

  return { meta: merged, state: "error" };
}

// --- the run in progress ---------------------------------------------------

export function readLocalRun(): RunSaveDto | null {
  return readJson(STORAGE_KEYS.run, RunSaveSchema);
}

/**
 * Writes the run in progress — unless what is already there is the same run
 * further along. A canvas rebuilt from a stale snapshot (a hot reload, a
 * remount) replays fewer actions than the player took, and its first save
 * would otherwise overwrite the real one with a shorter log.
 */
export function writeLocalRun(save: RunSaveDto): void {
  const held = readLocalRun();
  if (
    held !== null &&
    held.clientRunId === save.clientRunId &&
    held.actions.length > save.actions.length
  ) {
    return;
  }
  writeJson(STORAGE_KEYS.run, save);
}

export function clearLocalRun(): void {
  remove(STORAGE_KEYS.run);
}

/**
 * A finished run the player could not submit because they were signed out.
 * Kept so the offer to submit it survives the trip through sign-in.
 */
export function readPendingSubmit(): RunSaveDto | null {
  return readJson(STORAGE_KEYS.pendingSubmit, RunSaveSchema);
}

export function writePendingSubmit(save: RunSaveDto): void {
  writeJson(STORAGE_KEYS.pendingSubmit, save);
}

export function clearPendingSubmit(): void {
  remove(STORAGE_KEYS.pendingSubmit);
}

/**
 * Which of two unfinished runs to keep: the one with more decisions in it.
 *
 * Comparing timestamps would be the obvious rule and the wrong one — two
 * devices disagree about the time, and the clock says nothing about how much
 * of the run actually happened.
 */
export function pickLongerRun(a: RunSaveDto | null, b: RunSaveDto | null): RunSaveDto | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.actions.length >= b.actions.length ? a : b;
}

/** Pushes the run in progress up, quietly. Failure is not worth a toast. */
export async function pushRun(save: RunSaveDto): Promise<void> {
  const result = await saveRun(save);
  if (!result.ok && result.error.code !== "unauthorized") {
    console.warn("Could not save the run to the cloud:", result.error.message);
  }
}
