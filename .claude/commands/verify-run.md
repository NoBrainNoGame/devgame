---
description: Replay a stored save locally to reproduce what a player saw
argument-hint: <clientRunId | path to a save JSON file>
---

Reproduce the run identified by `$ARGUMENTS` — either a `clientRunId` to look
up in Postgres, or the path to a JSON file holding a `RunSaveDto`.

A run is its seed plus its ordered actions, and the engine is pure, so the save
is everything you need. No renderer, no server, no account.

1. **Get the save.**
   - From a `clientRunId` (needs the database up — run `/db-up` first):
     ```bash
     docker exec devgame-postgres psql -U devgame -d devgame -tAc \
       "SELECT save FROM \"Run\" WHERE \"clientRunId\" = '<uuid>';" > /tmp/run.json
     ```
     Also read back `status`, `version`, `rulesEpoch`, `score` and
     `fingerprint` from the same row — they are what the server believed.
   - From a browser: `localStorage` key `devgame:run:v1`, or
     `devgame:pending-submit:v1` for a finished run that never reached the
     server.
2. **Replay it.** Write a throwaway script and run it with `bun`:
   ```ts
   import { replayRun } from "@/game";
   const result = replayRun(JSON.parse(await Bun.file("/tmp/run.json").text()));
   console.log(result);
   ```
   `replayRun` validates with `RunSaveSchema`, runs `migrate`, rebuilds the run
   with `createRun` and applies every action.
3. **Read the result.**
   - `valid: false` with a `failedAt` — that index is the first action that was
     not legal. Print the state at `failedAt - 1` and the output of
     `getAvailableActions` there to see what the engine expected instead.
   - `valid: false` with no `failedAt` — the save did not parse or did not
     migrate. Compare `save.version` against `SAVE_VERSION`.
   - `valid: true` — compare `result.score` and `result.stats` against what the
     player reported, and `result.stats.hash` against the stored row.
4. **If the replay is valid but disagrees with the player**, check
   `save.rules` against today's `RULES_FINGERPRINT`. A run recorded under older
   rules replays under today's, which is precisely why it does not rank.
5. **To watch it happen**, step the log through `applyAction` from
   `src/game/core/rules/reducer.ts` and print the events per action, the way
   `scripts/sim.ts` does under `--verbose`.

Report: whether it replays, the score and stats the engine computes, how they
differ from the stored row and from what the player described, and — if it
fails — the failing action index, the action itself, and what was legal
instead.

You will NOT modify the stored run, the player's row, or any engine code to
make a replay succeed. A save that does not replay is evidence; changing the
rules until it does destroys it. Put scratch scripts and extracted saves in a
temporary directory, not in the repository, and do not commit them.
