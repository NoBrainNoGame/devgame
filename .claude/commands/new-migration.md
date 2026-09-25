---
description: Write a migration by hand when Prisma cannot express it, apply it, and verify it in Postgres
argument-hint: <what the migration must do>
---

Write the migration in `$ARGUMENTS` by hand — only what Prisma cannot express:
a partial index (`WHERE` on an index), a `DISTINCT ON`-shaped constraint, a
backfill, a data migration. **If the schema can express it**, edit
`prisma/schema.prisma` and run `bun run db:migrate` instead: an index that
exists only in a hand-written file is yours to keep alive.

The database must be up (`/db-up`).

1. Read `docs/database.md` and the two hand-written index migrations,
   `prisma/migrations/00000000000001_run_one_in_progress/migration.sql` and
   `00000000000002_run_unique_fingerprint/migration.sql`. Match their shape: a
   comment saying **why** it is hand-written and what breaks if it goes
   missing, then the SQL.
2. Create `prisma/migrations/<timestamp>_<snake_case_name>/migration.sql`,
   following the folder's numbering.
3. A non-null column on a populated table: add a `DEFAULT`, then
   `ALTER COLUMN ... DROP DEFAULT` at once, so nothing new is written without a
   real value.
4. Apply with `bun run db:deploy` — **not** `prisma migrate dev`, which may
   decide a hand-written file means drift and offer to reset.
5. Verify in Postgres, not in the file:
   ```bash
   docker exec devgame-postgres psql -U devgame -d devgame \
     -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Run';"
   ```
   A partial unique index shows its `WHERE` in `indexdef`; a column,
   `\d+ "Run"`.
6. Confirm the two standing invariants survived:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE indexname IN ('Run_one_in_progress', 'Run_one_finished_per_fingerprint');
   ```
   Two rows, or say so loudly.
7. `bun x prisma migrate status` and `bun run check`.

Report the file, the SQL and the verification query's actual output (the real
`indexdef`, not a claim).

Never: run `prisma migrate reset`, `bun run db:reset` or `prisma db push`
(denied in `.claude/settings.json`, destructive, need human consent); drop
`Run_one_in_progress` or `Run_one_finished_per_fingerprint`; edit an applied
migration (write a new one).
