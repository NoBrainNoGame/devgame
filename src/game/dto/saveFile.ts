import { z } from "zod";

import { MetaProgressSchema } from "@/game/dto/meta";
import { RunSaveSchema } from "@/game/dto/run";

/**
 * A save carried out of the browser and back: the account's progress and the
 * run in progress, in one file the player keeps. It comes back from a disk
 * nobody controls, so it goes through the same schemas as `localStorage` and
 * the network, and nothing in it is trusted before they pass it.
 */

export const SAVE_FILE_KIND = "devgame-save";
export const SAVE_FILE_VERSION = 1;

/** A save file is a few kilobytes; anything much larger is not one. */
export const SAVE_FILE_MAX_BYTES = 2_000_000;

export const SaveFileSchema = z.object({
  kind: z.literal(SAVE_FILE_KIND),
  version: z.literal(SAVE_FILE_VERSION),
  exportedAt: z.iso.datetime(),
  meta: MetaProgressSchema,
  run: RunSaveSchema.nullable(),
});

export type SaveFileDto = z.infer<typeof SaveFileSchema>;

export type SaveFileParse =
  | { ok: true; file: SaveFileDto }
  | { ok: false; reason: "too_large" | "not_json" | "not_a_save" };

export function parseSaveFile(text: string): SaveFileParse {
  if (text.length > SAVE_FILE_MAX_BYTES) return { ok: false, reason: "too_large" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not_json" };
  }
  const parsed = SaveFileSchema.safeParse(raw);
  return parsed.success ? { ok: true, file: parsed.data } : { ok: false, reason: "not_a_save" };
}
