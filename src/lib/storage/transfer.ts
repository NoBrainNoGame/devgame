import type { MetaProgressDto, RunSaveDto } from "@/game";
import { SAVE_FILE_KIND, SAVE_FILE_VERSION, type SaveFileDto } from "@/game/dto/saveFile";
import { mergeMeta } from "@/lib/profile/merge";
import { pickLongerRun } from "@/lib/storage/runs";

/**
 * Exporting a save, and what importing one does to what is already here.
 *
 * Progress is merged, never replaced: `mergeMeta` is the only rule for two
 * copies of a player, and it keeps the better of each — an old backup can
 * bring back what was lost, not take away what was earned since. The run is
 * a choice: the same run keeps its longer log; another run replaces the one
 * in progress, and the screen asks first.
 */

export function exportSave(
  meta: MetaProgressDto,
  run: RunSaveDto | null,
  now: string,
): SaveFileDto {
  return { kind: SAVE_FILE_KIND, version: SAVE_FILE_VERSION, exportedAt: now, meta, run };
}

export interface ImportPlan {
  meta: MetaProgressDto;
  run: RunSaveDto | null;
  /** The run in progress here is a different one, and importing ends it. */
  replacesRun: boolean;
}

export function planImport(
  current: { meta: MetaProgressDto; run: RunSaveDto | null },
  file: SaveFileDto,
): ImportPlan {
  const meta = mergeMeta(current.meta, file.meta);
  if (file.run === null) return { meta, run: current.run, replacesRun: false };
  if (current.run === null) return { meta, run: file.run, replacesRun: false };
  if (current.run.clientRunId === file.run.clientRunId) {
    return { meta, run: pickLongerRun(current.run, file.run), replacesRun: false };
  }
  return { meta, run: file.run, replacesRun: true };
}

/** `devgame-2026-09-25.json`: sorts by date in a downloads folder. */
export function saveFileName(now: string): string {
  return `devgame-${now.slice(0, 10)}.json`;
}
