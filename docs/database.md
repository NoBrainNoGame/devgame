# Database

Prisma 7 with the `pg` driver adapter, on plain PostgreSQL 17
(`postgres:17-alpine` in `docker-compose.yml`). No extension: production needs
a stock server.

## Layout

- Schema `prisma/schema.prisma`; migrations `prisma/migrations`; CLI config
  `prisma7.config.ts`; runtime client `src/lib/db.ts`.
- Generated client `src/generated/prisma`: **gitignored**, recreated by
  `bun x prisma generate` (run by `postinstall`).
- No `prisma/seed.ts`: content lives in `src/game/content/`, so the app needs
  nothing seeded. `bun run fixtures` (`scripts/fixtures.ts`) loads development
  data (accounts, runs, page views, run samples, bug reports) through the
  app's own functions (`replayRun`, `applyRunToMeta`, `ingestSample`), found
  again by address or id and replaced on the next load. It refuses any
  `DATABASE_URL` not on this machine.

## Why the datasource URL lives in `prisma7.config.ts`

Prisma 7 removed `url` from the schema's `datasource` (the CLI reads the
config) and no longer loads `.env`, hence `dotenv/config` in that file (a no-op
in containers). The image ships the config, the schema and a minimal Prisma
CLI under `/app/migrator` so `dotenv/config` resolves when `entrypoint.sh`
runs `migrate deploy` (see the Dockerfile). At runtime the app ignores the
file: `src/lib/db.ts` builds a `PrismaPg` adapter, which owns the `pg` pool,
from `env.DATABASE_URL`; Prisma 7 requires a driver adapter.

## Migrations

```bash
bun run db:migrate      # create + apply, development
bun run db:deploy       # apply committed migrations, production
bun run db:studio       # browse the data
```

Production migrates at container start (`entrypoint.sh`,
[hosting.md](./hosting.md)). `prisma migrate reset` destroys data; it asks for
explicit consent and Prisma refuses to run it non-interactively from an agent.
Never script around that.

## Raw SQL lives in one module

The only raw SQL is `src/lib/leaderboard/queries.ts`: a player's best run needs
`DISTINCT ON`, which Prisma cannot express. Any future raw SQL goes there.

## Indexes

Express indexes in the schema wherever possible: Prisma `DROP`s what it does
not know on the next `migrate dev`, and an index living only in a hand-written
migration is yours to keep alive.

### The `Run` indexes

The leaderboard is **derived from `Run`** (no board table), so every board
query needs an index or it scans every run ever played.

| Index | Serves |
|---|---|
| `@@index([profileId, status])` | Resume: this player's run still `in_progress`. |
| `@@index([rulesEpoch, mode, status, score(sort: Desc), finishedAt])` | Classic board: `WHERE rulesEpoch = ? AND mode = ? AND status = 'finished' ORDER BY score DESC`. |
| `@@index([rulesEpoch, dailyDate, status, score(sort: Desc)])` | Daily board: the same on `dailyDate`. |
| `@@index([profileId, fingerprint])` | Duplicate detection; not unique, since an abandoned run and its game's finished submission share a fingerprint. |

Order matters: equality columns first, the sort column last, so Postgres walks
the index in `score DESC` instead of sorting; `finishedAt` trails the classic
index to break ties without a heap lookup. `score` is written only by
`submitRun`, from `replayRun`, never from the client: a board row is as
trustworthy as the replay.

### Two partial unique indexes are hand-written

Prisma cannot put a `WHERE` on an index, so these live in migrations:

```sql
-- prisma/migrations/00000000000001_run_one_in_progress/migration.sql
-- At most one run in progress per player per mode.
CREATE UNIQUE INDEX "Run_one_in_progress"
  ON "Run" ("profileId", "mode")
  WHERE "status" = 'in_progress';

-- prisma/migrations/00000000000002_run_unique_fingerprint/migration.sql
-- One finished submission per player per run fingerprint (seed + actions).
CREATE UNIQUE INDEX "Run_one_finished_per_fingerprint"
  ON "Run" ("profileId", "fingerprint")
  WHERE "status" = 'finished';
```

**Read this before touching migrations.** Prisma does not know they exist: it
will not reproduce them in a `migrate diff` nor warn they are missing, and
`migrate dev` happily produces a schema without them. Without
`Run_one_in_progress` a player can hold two in-progress runs per mode, which
silently breaks resume ("the run still in progress" is no longer one row).
Without `Run_one_finished_per_fingerprint` one good run can be submitted for
credit again and again under fresh client-chosen `clientRunId`s.

**If migrations are ever squashed or regenerated, re-add both by hand**, then
check a fresh database; a missing row is a lost invariant:

```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE indexname IN ('Run_one_in_progress', 'Run_one_finished_per_fingerprint');
```

## `VisitDay` counts pages, not people

One row per UTC day, route and language: views, and visits (a browser tab's
first view). Routes come from the closed list in `src/lib/visits/paths.ts`,
anything else is `/other`. Nothing about the visitor is stored or read — no
cookie, no address — and Global Privacy Control browsers are not counted. The
beacon always answers 204.

## `BugReport` is text, kept as text

A signed-in player's title, body, page (same closed list), optional seed,
status and administrator's note. Every column bounded, validated in
`src/lib/report/validate.ts` before Prisma, rendered as text everywhere.
Deleted with the account.

## `RunSample` is a run with nobody in it

A save (seed, starter profile, action log) plus the `RunSummary` the server
replayed from it, one row per `(clientRunId, kind, sprint)`. `kind`: `final`
(ended), `checkpoint` (every ten sprints while it goes on), `abandoned`
(another run started over it). No user id, no address: it cannot be joined to
a person. `/api/telemetry` replays before writing, so forged logs never land.
The admin Balance page aggregates summaries with
`src/lib/telemetry/digest.ts`, filtering on the `(rules, kind, createdAt)`
index.

## `Profile.bannedAt` is the one moderation tool

Set, with an optional `banReason`, from the local admin panel. A banned
profile keeps its account and the game, but `submitRun` refuses its scores,
leaderboard queries drop it (`p."bannedAt" IS NULL`) and it cannot file
reports. Nothing else reads it.

## `Profile.metaVersion` is an optimistic lock

Meta-progression is written from whichever device the player used last; the
client owns only its local copy. `syncMeta` merges (`mergeMeta` in
`src/lib/profile/merge.ts`, the only merge logic, on both sides), then updates
**guarded by the `metaVersion` it merged from**, incrementing it. Zero rows
matched means another device wrote in between: no blind retry, no overwrite —
it returns a `conflict` with the server copy for the caller to merge again.
Last-write-wins would quietly delete unlocks.

## Better Auth owns four tables

`user`, `session`, `account`, `verification`, lowercased with `@@map`. Sharing
the database gives `Profile` a real foreign key to `User.id`, cascading on
delete. After enabling a plugin, regenerate and apply the diff as a migration;
never hand-edit those models:

```bash
bun x @better-auth/cli@latest generate
bun run db:migrate
```

## The run row keeps the save whole

`Run.save` is the whole `RunSaveDto` as sent; the columns beside it (`seed`,
`mode`, `dailyDate`, `status`, `version`, `rulesEpoch`, `score`,
`sprintsCompleted`, `ticketsDelivered`, `commits`, `fingerprint`) only serve
queries. Never keep just the action list: the save also carries the starter
profile, account unlocks and starting skill points in force, which shape the
map. Without them a replay is a different game, scored differently, that
looks like a working feature.

Anything read from `save` is re-validated with `RunSaveSchema`: an older
build's row is untrusted input, and a save the current build cannot parse must
not be resumed — it would drop the player into a run that never happened.

## Runs belong to a rules epoch

`Run.rulesEpoch` records the rules a submission was played under; every
leaderboard query filters on one epoch, the current one by default or an older
one offered from `RULES_EPOCHS` (labelled with the package version that
shipped it and the day it reached `main`), so runs of two different games are
never ranked together. Rows older than the column carry epoch 0, invisible to
today's boards — correctly.

`RULES_EPOCH` (`src/game/dto/version.ts`) is bumped by hand when a change makes
an old action log replay to a different game. The fingerprint beside it
catches balance-table and content-id changes on its own, not rules-code
changes: that is the epoch's job.
