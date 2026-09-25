---
description: Replay a stored save locally to reproduce what a player saw
argument-hint: <clientRunId | path to a save JSON file>
---

Reproduce the run in `$ARGUMENTS` (a `clientRunId` in Postgres, or a JSON file
holding a `RunSaveDto`). The engine is pure and a run is seed + ordered
actions: the save is all you need, no renderer, server or account.

1. **Get the save.**
   - `clientRunId` (`/db-up` first):
     ```bash
     docker exec devgame-postgres psql -U devgame -d devgame -tAc \
       "SELECT save FROM \"Run\" WHERE \"clientRunId\" = '<uuid>';" > /tmp/run.json
     ```
     Also read what the server believed: the row's `status`, `version`,
     `rulesEpoch`, `score`, `sprintsCompleted`, `ticketsDelivered`, `commits`,
     `fingerprint`.
   - Browser: `localStorage` key `devgame:run:v3`, or
     `devgame:pending-submit:v3` for a finished run that never reached the
     server (`STORAGE_KEYS`, `src/lib/storage/keys.ts`).
2. **Replay** with a throwaway `bun` script. `@/` does not resolve outside the
   repository; import by absolute path:
   ```ts
   import { replayRun } from "/absolute/path/to/devgame/src/game/index.ts";
   const result = replayRun(JSON.parse(await Bun.file("/tmp/run.json").text()));
   console.log(result);
   ```
   `replayRun` validates (`RunSaveSchema`), runs `migrate`, rebuilds with
   `createRun`, applies every action.
3. **Read the result.**
   - `valid: false` + `failedAt`: first illegal action. Print the state at
     `failedAt - 1` and `getAvailableActions` there.
   - `valid: false`, no `failedAt`: did not parse or migrate; compare
     `save.version` with `SAVE_VERSION`.
   - `valid: true`: compare `result.score` and `result.stats` with the
     player's report and the row (`stats.hash` hashes the final state, for a
     live session).
4. **Valid but not what the player saw?** Compare `save.rules` with today's
   `RULES_FINGERPRINT`: old-rules runs replay under today's rules — why they
   do not rank.
5. **To watch it**, step the log through `applyAction`
   (`src/game/core/rules/reducer.ts`), printing each action's events, as
   `scripts/sim.ts --verbose` does.

Report: replays or not; the engine's score and stats; differences from the row
and the player's account; on failure, the index, the action, what was legal.

Never modify the stored run, the player's row or engine code to make it pass:
a save that does not replay is evidence. Scratch scripts and saves go in a
temporary directory, never in the repository or a commit.
