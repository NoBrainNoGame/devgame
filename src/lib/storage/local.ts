"use client";

import type { ZodType } from "zod";

/**
 * Reading and writing `localStorage` without ever trusting it.
 *
 * Everything that comes back is parsed by the same schema the server uses. A
 * value that does not parse is deleted: it was written by a build that no
 * longer exists, and carrying it forward would break the game in a way the
 * player cannot diagnose or fix.
 *
 * Storage can also simply not be there — a private window, blocked site data,
 * a quota that is full — so every access is guarded and every failure is
 * survivable. The game works without persistence; it just forgets.
 */

export function readJson<T>(key: string, schema: ZodType<T>): T | null {
  if (typeof window === "undefined") return null;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through: unparseable JSON is as dead as an invalid shape.
  }

  console.warn(`Discarding an unreadable save at ${key}`);
  remove(key);
  return null;
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full quota is not worth interrupting a run for.
  }
}

export function remove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do, and nothing that depends on it.
  }
}
