---
description: Add a field to a save or meta DTO, through the schema, migration, action, storage and claims
argument-hint: <field being added and what it is for>
---

Add the field in `$ARGUMENTS` to the DTOs. The DTO is the trust boundary: work
in the order of `docs/maintenance.md`,
"Changing a DTO after adding a feature", which keeps it intact.

1. **`src/game/dto/run.ts` or `meta.ts`**: the Zod schema, bounded — strings
   `.max()`, numbers `.min().max()`. Unbounded input makes a replay run
   forever.
2. **`src/game/dto/version.ts`**: bump `SAVE_VERSION` if the field is required
   (a stored save would now fail `RunSaveSchema.safeParse`).
3. **`src/game/dto/migrations.ts`**: every bump gets an `n` → `n + 1` entry,
   or old saves stop loading (a run the player cannot resume, a rejected
   submission).
4. **`prisma/schema.prisma`**: only if a query filters or sorts on it;
   otherwise it stays in the `save` JSON column.
5. **`bun run db:migrate`** (`/db-up` first). Review the SQL: a non-null column
   on a populated table needs a default, dropped right after.
6. **`src/lib/run/actions.ts`**: through `saveRun` and `submitRun`. Server
   actions are public endpoints; re-do every check here.
7. **`src/lib/run/claims.ts`**: add it to `overclaims` if it changes the map
   or the rolls. A replay is only as trustworthy as its starting conditions
   (`tests/anti-cheat.test.ts`: a save claiming 999 in every stat replays as
   valid). A save may claim less than the account has, never more.
8. **`src/game/dto/replay.ts`**: if it feeds `createRun`, add it to the `meta`
   object, or the server replays a different game.
9. **`src/lib/storage/sync.ts`**: the client side, same schema.
10. **`src/game/index.ts`**: export the type if needed outside `src/game`.
11. **Tests**: `tests/dto.test.ts` (good shape accepted, bad rejected),
    `tests/claims.test.ts` (with the off-by-one), `tests/determinism.test.ts`
    if replay is affected.

Finish with `bun run check`, and check by hand that a save without the field
still loads through `migrate`.

Never add anything score-shaped: no DTO carries a score, rank, multiplier or
any number the server can compute. `submitRun` replays the log and writes what
the engine found; `tests/dto.test.ts` asserts a client `score` is stripped. If
the field is a result rather than an input, say so and stop.
