---
description: Start the local Postgres container, wait for health, apply migrations
---

Bring the local database up and make it usable:

1. `docker compose up -d`
2. Poll `docker inspect -f '{{.State.Health.Status}}' starter-postgres` until it
   reports `healthy` (give it up to 60s). If Docker itself is not running, say so
   and stop — do not try to start Docker Desktop without asking.
3. `bun x prisma migrate deploy`
4. `docker exec starter-postgres psql -U starter -d starter -c "\dx"` and confirm
   both `vector` and `pg_trgm` are listed.

Report the final state in two lines: container status, and whether migrations
were already up to date or newly applied.

If port 5433 is already taken by another project, re-run with
`POSTGRES_PORT=5434 docker compose up -d` and update `DATABASE_URL` to match.
