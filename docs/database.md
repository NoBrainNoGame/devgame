# Database

Prisma 7 with the `pg` driver adapter, against plain PostgreSQL 17. The schema
uses no extension: `docker-compose.yml` runs `postgres:17-alpine` and production
needs nothing installed beyond a stock server.

## Layout

- Schema: `prisma/schema.prisma`
- Generated client: `src/generated/prisma` — **gitignored**, recreated by
  `bun x prisma generate` (which `postinstall` runs for you)
- Migrations: `prisma/migrations`
- Prisma CLI config: `prisma7.config.ts`
- Runtime client: `src/lib/db.ts`

There is no `prisma/seed.ts`. Add one when the schema has something worth
seeding — content tables live in `src/game/content/`, not in Postgres — and
register it under `"prisma": { "seed": "bun prisma/seed.ts" }` in
`package.json`.

## Why the datasource URL lives in `prisma7.config.ts`

Prisma 7 removed `url` from the schema's `datasource` block; the CLI reads the
connection string from the config file instead. Prisma 7 also stopped loading
`.env` on its own, which is why that file imports `dotenv/config` — a no-op in
containers, where the variables are already in the environment.

The production image ships `prisma7.config.ts`, the schema and a minimal Prisma
CLI under `/app/migrator`, so that `dotenv/config` resolves when `entrypoint.sh`
runs `migrate deploy`. See the Dockerfile.

At runtime the app does not use that file at all: `src/lib/db.ts` builds a
`PrismaPg` adapter from `env.DATABASE_URL`. Prisma 7 requires a driver adapter,
and `PrismaPg` owns the `pg` connection pool.

## Migrations

```bash
bun run db:migrate      # create + apply, development
bun run db:deploy       # apply committed migrations, production
bun run db:studio       # browse the data
```

In production, migrations run automatically at container start-up — see
`entrypoint.sh` and [hosting.md](./hosting.md).

`prisma migrate reset` destroys data. It asks for explicit consent, and Prisma
refuses to run it non-interactively from an agent. Never script around that.

## Indexes

Express indexes in the schema wherever possible, because Prisma will `DROP`
anything it does not know about on the next `migrate dev`. An index that only
exists in a hand-written migration is an index you are now responsible for
keeping alive.

### The three `Run` indexes

The leaderboard is **derived from `Run`**; there is no denormalised board table,
which means every board query has to be served by an index or it becomes a
sequential scan over every run ever played.

| Index | Query it serves |
|---|---|
| `@@index([profileId, status])` | Resume: the one run still `in_progress` for this player. |
| `@@index([mode, status, score(sort: Desc), finishedAt])` | Classic board: `WHERE mode = ? AND status = 'finished' ORDER BY score DESC`. |
| `@@index([dailyDate, status, score(sort: Desc)])` | Daily board: `WHERE dailyDate = ? AND status = 'finished' ORDER BY score DESC`. |

The column order matters and is not cosmetic. Equality columns come first, the
sort column last, so Postgres can walk the index in `score DESC` order instead
of sorting the matching rows. `finishedAt` is trailing on the classic index to
break ties without a heap lookup.

`score` is only ever written by `submitRun`, from what `replayRun` computed —
never from the client. A board row is therefore as trustworthy as the replay.

### `Run_one_in_progress` is hand-written

A player may have at most one run in progress **per mode**. That is a partial
unique index:

```sql
CREATE UNIQUE INDEX "Run_one_in_progress"
  ON "Run" ("profileId", "mode")
  WHERE "status" = 'in_progress';
```

It lives in `prisma/migrations/00000000000001_run_one_in_progress/migration.sql`
because Prisma cannot express a `WHERE` clause on an index.

**Read this before touching migrations.** Prisma does not know this index
exists. It will not reproduce it in a `migrate diff`, it will not warn you that
it is missing, and `migrate dev` will happily produce a schema that silently
lets a player hold two in-progress runs per mode — which breaks resume, because
"the run still in progress" is no longer a single row.

So: **if migrations are ever squashed or regenerated from scratch, re-add this
migration by hand.** The check is one query against a fresh database:

```sql
SELECT indexdef FROM pg_indexes WHERE indexname = 'Run_one_in_progress';
```

Nothing returned means the invariant is gone.

## `Profile.metaVersion` is an optimistic lock

Meta-progression is written from whichever device the player last used, and the
client is authoritative for nothing but its own local copy. `syncMeta` merges
server state with client state (`mergeMeta` in `src/lib/profile/merge.ts`, the
only merge logic, running on both sides) and then issues an update **guarded by
the `metaVersion` it merged from**, incrementing it.

If zero rows match, another device wrote in between. The action does not retry
blindly and does not overwrite: it returns a `conflict` together with the
current server copy, so the caller can merge again against fresh state. A
last-write-wins update here would quietly delete unlocks.

## Better Auth owns four tables

`user`, `session`, `account` and `verification` are Better Auth's, mapped to
lowercase names with `@@map`. Keeping them in the same database is what lets
`Profile` reference `User.id` with a real foreign key and cascade on delete.

After enabling a Better Auth plugin, regenerate and apply the diff as a
migration:

```bash
bun x @better-auth/cli@latest generate
bun run db:migrate
```

Do not hand-edit those four models to match; regenerate them.
