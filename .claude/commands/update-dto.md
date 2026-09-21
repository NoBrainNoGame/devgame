---
description: Add a field to a save or meta DTO, through the schema, migration, action, storage and claims
argument-hint: <field being added and what it is for>
---

Add the field described by `$ARGUMENTS` to the DTOs.

The DTO is the trust boundary. Work in the order from `docs/maintenance.md`,
"Changing a DTO after adding a feature", because that is the order in which the
boundary stays intact:

1. **`src/game/dto/run.ts` or `meta.ts`** — add it to the Zod schema, with a
   bound. Strings get `.max()`, numbers get `.min().max()`. Unbounded input is
   how a replay is made to run forever.
2. **`src/game/dto/version.ts`** — bump `SAVE_VERSION` if the field is
   required, i.e. if an existing stored save would now fail
   `RunSaveSchema.safeParse`.
3. **`src/game/dto/migrations.ts`** — every `SAVE_VERSION` bump gets an entry
   turning `n` into `n + 1`. Without it, old saves stop loading: in the browser
   that is a run the player cannot resume, on the server a rejected
   submission.
4. **`prisma/schema.prisma`** — only if a query needs to filter or sort on it.
   Anything read only as part of the whole save stays inside the `save` JSON
   column.
5. **`bun run db:migrate`** — needs the database up, so run `/db-up` first.
   Review the generated SQL; a non-null column on a populated table needs a
   default, and the default should be dropped immediately afterwards.
6. **`src/lib/run/actions.ts`** — thread it through `saveRun` and `submitRun`.
   Server actions are public endpoints: every check is re-done here.
7. **`src/lib/run/claims.ts`** — if the field changes the map or the rolls, add
   it to `overclaims`. That file exists because the replay is only as
   trustworthy as the conditions it starts from; `tests/anti-cheat.test.ts`
   shows a save claiming 999 in every stat replaying as perfectly valid. The
   rule is one-sided: a save may claim less than the account has, never more.
8. **`src/game/dto/replay.ts`** — if the field feeds `createRun`, add it to the
   `meta` object, or the server replays a different game from the one played.
9. **`src/lib/storage/sync.ts`** — the client side, through the same schema.
10. **`src/game/index.ts`** — export the type if anything outside `src/game`
    needs it.
11. **Tests** — `tests/dto.test.ts` (accepts the good shape, rejects the bad
    one), `tests/claims.test.ts` (including the off-by-one), and
    `tests/determinism.test.ts` if it affects replay.

Finish with `bun run check`, and confirm by hand that a save without the new
field still loads through `migrate`.

You will NOT add anything score-shaped. No DTO may carry a score, a rank, a
multiplier or any other number the server could otherwise have computed —
`submitRun` replays the log and writes what the engine found, and
`tests/dto.test.ts` asserts a client-supplied `score` is stripped. If the field
being asked for is a result rather than an input, say so and stop. You will
also not skip the migration when `SAVE_VERSION` moves, and not add an unbounded
string or array to a schema.
