---
description: Write a migration by hand when Prisma cannot express it, apply it, and verify it in Postgres
argument-hint: <what the migration must do>
---

Write the migration described by `$ARGUMENTS` by hand.

Use this only when Prisma genuinely cannot express the change: a partial
index (`WHERE` on an index), a `DISTINCT ON`-shaped constraint, a backfill, a
data migration. **If the schema can express it, do not use this command** —
edit `prisma/schema.prisma` and run `bun run db:migrate`, because an index that
exists only in a hand-written file is an index you are now responsible for
keeping alive.

The database must be up. Run `/db-up` first if it is not.

1. Read `docs/database.md` and the two existing hand-written migrations —
   `prisma/migrations/00000000000001_run_one_in_progress/migration.sql` and
   `00000000000002_run_unique_fingerprint/migration.sql`. Match their shape:
   a comment block saying **why** it is hand-written and what breaks if it goes
   missing, then the SQL.
2. Create `prisma/migrations/<timestamp>_<snake_case_name>/migration.sql`.
   Follow the numbering already in the folder.
3. If it adds a non-null column to a populated table, add a `DEFAULT`, then
   `ALTER COLUMN ... DROP DEFAULT` immediately, so nothing new can be written
   without a real value.
4. Apply it with `bun run db:deploy`. Do **not** use `prisma migrate dev` for a
   hand-written file — it may decide the schema has drifted and offer to reset.
5. Verify it exists in Postgres, not in the migration file:
   ```bash
   docker exec devgame-postgres psql -U devgame -d devgame \
     -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Run';"
   ```
   For a partial unique index, check the `WHERE` clause is in `indexdef`.
   For a column, `\d+ "Run"`.
6. Confirm the two standing invariants are still present, because any migration
   work is a chance to lose them:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE indexname IN ('Run_one_in_progress', 'Run_one_finished_per_fingerprint');
   ```
   Two rows, or say so loudly.
7. `bun x prisma migrate status` and `bun run check`.

Report the file you created, the SQL, and the output of the verification query
— the actual `indexdef`, not a claim that it worked.

You will NOT run `prisma migrate reset`, `bun run db:reset` or `prisma db push`
— all three are denied in `.claude/settings.json`, they destroy data, and they
need explicit human consent. You will not drop `Run_one_in_progress` or
`Run_one_finished_per_fingerprint`. You will not edit an already-applied
migration file; write a new one. And you will not report success from the file
on disk — only from a query against the running database.
