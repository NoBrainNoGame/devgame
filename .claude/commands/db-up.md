---
description: Start the local Postgres container, wait for health, apply migrations
---

1. `bun run db:up` (also starts the admin panel in the background if `.env` has
   an `ADMIN_PASSWORD`).
2. Poll `docker compose exec -T postgres pg_isready -U devgame -d devgame` until
   it succeeds (up to 60 s). If Docker is not running, say so and stop; do not
   start Docker Desktop without asking.
3. `bun run db:deploy`
4. Confirm the two hand-written partial unique indexes survived (Prisma neither
   reproduces nor warns about them):

   ```bash
   docker compose exec -T postgres psql -U devgame -d devgame \
     -c "SELECT indexname FROM pg_indexes WHERE tablename = 'Run';"
   ```

   Both `Run_one_in_progress` and `Run_one_finished_per_fingerprint` must be
   listed; a missing one means its migration did not run (`docs/database.md`).

Report two lines: container status; migrations already up to date or newly
applied.

Container `devgame-postgres`, user and database `devgame`, host port 5443. Port
taken: `POSTGRES_PORT=5500 bun run db:up`, and update `DATABASE_URL` in `.env`.
No Postgres extensions: do not look for `vector` or `pg_trgm`.

Never run `db:reset` (destroys data, denied). If the database needs rebuilding,
say so and let a human decide.
