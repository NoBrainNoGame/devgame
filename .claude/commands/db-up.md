---
description: Start the local Postgres container, wait for health, apply migrations
---

Bring the local database up and make it usable:

1. `bun run db:up`
2. Poll `docker compose exec -T postgres pg_isready -U devgame -d devgame` until
   it succeeds (give it up to 60s). If Docker itself is not running, say so and
   stop — do not start Docker Desktop without asking.
3. `bun run db:deploy`
4. Confirm the two hand-written partial unique indexes survived, because Prisma
   neither reproduces nor warns about them:

   ```bash
   docker compose exec -T postgres psql -U devgame -d devgame \
     -c "SELECT indexname FROM pg_indexes WHERE tablename = 'Run';"
   ```

   `Run_one_in_progress` and `Run_one_finished_per_fingerprint` must both be
   listed. If either is missing, its migration did not run — see
   `docs/database.md`.

Report the final state in two lines: container status, and whether migrations
were already up to date or newly applied.

The container is `devgame-postgres`, the user and database are both `devgame`,
and the host port is 5443. If that port is taken, re-run with
`POSTGRES_PORT=5500 bun run db:up` and update `DATABASE_URL` in `.env` to match.

This schema uses **no Postgres extensions** — do not go looking for `vector` or
`pg_trgm`.

Do not run `db:reset`: it destroys data and is in the deny list. If the database
needs rebuilding, say so and let a human decide.
