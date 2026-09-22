import type { RunSaveDto } from "@/game/dto/run";
import { SAVE_VERSION } from "@/game/dto/version";

/**
 * Bringing an old save forward.
 *
 * One entry per version bump, each turning version `n` into `n + 1`. They take
 * and return loosely typed objects because an old save is, by definition, not
 * the current shape — the result is re-validated by the caller.
 *
 * A save from the future is refused rather than guessed at: a client that has
 * not reloaded should not silently drop fields it does not understand.
 */

type LooseSave = Record<string, unknown>;

const MIGRATIONS: Record<number, (save: LooseSave) => LooseSave> = {
  // 1 -> 2 has no entry on purpose: version 1 recorded walks over a generated
  // map, and no ticket-shaped game corresponds to that log. `STORAGE_KEYS.run`
  // moved to `:v2` so a browser simply starts fresh.
};

export type MigrationResult = { ok: true; dto: RunSaveDto } | { ok: false; error: string };

export function migrate(save: RunSaveDto): MigrationResult {
  if (save.version > SAVE_VERSION) {
    return {
      ok: false,
      error: `Save version ${save.version} is newer than this build (${SAVE_VERSION}). Reload the page.`,
    };
  }

  let current: LooseSave = { ...save };
  let version = save.version;

  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (step === undefined) {
      return { ok: false, error: `No migration from save version ${version}` };
    }
    current = step(current);
    version += 1;
    current.version = version;
  }

  return { ok: true, dto: current as unknown as RunSaveDto };
}
