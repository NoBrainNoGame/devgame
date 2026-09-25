# Hosting

Target: **Coolify on a single VPS** hosting many unrelated apps; `Dockerfile`,
`entrypoint.sh`, `output: "standalone"` and `/api/health` exist for it. Vercel
also works unchanged ([below](#if-this-does-not-fit-you)).

## Why this shape

Sites launch often and mostly die, so cost and effort must be flat: no
per-project pricing, no hand-written compose, DNS or TLS per site. Coolify is
one machine, one bill, unlimited apps; a new app is a form.

|  | Vercel Pro | Coolify on a VPS |
|---|---|---|
| Cost | ~$20/mo flat, unlimited projects | ~€8/mo flat, unlimited apps |
| New app | `git push` | a form, then `git push` |
| Ops | none | yours |
| Function time limit | 300 s | none |
| Postgres | managed, per project | one instance, one database per app |
| Ceiling | none | the machine's RAM |

Vercel is also flat, less work, ~€15/month more at ten apps. Coolify buys no
time limit, full database control and free marginal apps. Domains (~€10/year
each) are the real recurring cost, zero with [wildcard DNS](#wildcard-dns)
until a site earns a name.

## The machine

Any VPS with Docker. 4 vCPU / 8 GB (Hetzner CX32 or equivalent, ~€8/month when
written; prices move) runs Coolify, Postgres and a dozen apps like this. Not
2 GB: Coolify takes ~1 GB, builds need headroom.

```bash
# on a fresh Debian/Ubuntu VPS, as root
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Coolify serves its UI on port 8000, provisions TLS via its bundled proxy
(Traefik or Caddy) and runs deployments.

## Wildcard DNS

Before the first app:

```
*.lab.yourdomain.com.   A   <VPS IP>
```

Set it as Coolify's instance wildcard domain: each new app gets a working HTTPS
URL at creation, with no DNS record, certificate or domain to buy.

## Postgres: one instance, many databases

**One** Postgres in Coolify for the machine, from plain `postgres:17-alpine`,
the image `docker-compose.yml` uses locally (no extension needed). Each app
gets a database and a role, not an instance: one instance is one set of shared
buffers and WAL writer, one process tree, one backup.

```sql
-- as the superuser, once per app
CREATE ROLE myapp LOGIN PASSWORD '<generated>';
CREATE DATABASE myapp OWNER myapp;
```

Raise `max_connections` (200 is a sane start): every app holds its own
`@prisma/adapter-pg` pool and the default 100 runs out early. Connect over
Coolify's internal network; never publish the database to the host:

```
DATABASE_URL=postgresql://myapp:<password>@<postgres-service>:5432/myapp?schema=public
```

## Deploying this app

In Coolify: **New Resource → Private/Public Repository**, then

| Setting | Value |
|---|---|
| Build pack | Dockerfile |
| Dockerfile target | *(leave empty — `runner` is the last stage)* |
| Port | `3000` |
| Health check path | `/api/health` |

Paste the variables from `.env.example` (checked by `src/lib/env.ts`):

- **Required** to boot: `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `DAILY_SEED_SECRET` (secrets: 16 characters minimum).
- `CRON_SECRET`: unset, every `/api/cron` route is off.
- `APP_URL`, `BETTER_AUTH_URL`: the real public URL, or OAuth callbacks break.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: see
  [What gates what](#what-gates-what).

`DAILY_SEED_SECRET` keys the daily seed. Rotating it changes *future* dailies
only (past seeds are memoised in `DailySeed`, so old boards stay comparable).
Losing it loses no data, but deployments with different values serve
different games of the day.

### The image is the standalone build

`output: "standalone"` in `next.config.ts` is load-bearing: `runner` copies
`.next/standalone`; without it the image boots, then 404s on every asset. Only
files the build traced as imported are in it, so `messages/` translations load
by dynamic `import()` (`src/i18n/request.ts`), never `fs`: a runtime-built
`readFile` path would build, start, pass the health check, then 500 on the
first localised page. Same for any future data file.

### The build runs on placeholder values

`src/lib/env.ts` validates when `next build` imports it, so the Dockerfile's
`builder` stage sets placeholder `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`CRON_SECRET` and `DAILY_SEED_SECRET` (never baked into the output). A new
*required* variable needs a placeholder there too, or the image stops
building. CI (`.github/workflows/ci.yml`, `main` only) builds the same way.

### Migrations run themselves

`entrypoint.sh` runs `prisma migrate deploy` from `/app/migrator` before the
server, so a deploy is a push. It applies committed migrations only, never
prompts or resets, and holds a Postgres advisory lock, so replicas starting
together are safe. `RUN_MIGRATIONS=false` skips it (e.g. to debug a failed
start).

**The cost is image size.** The Prisma 7 CLI is ~285 MB (it requires Prisma
Studio and the dev server even for `migrate deploy`; pruning breaks on the
next patch), so the image is ~820 MB. Coolify builds where it runs, so nothing
crosses the network, and the CLI layer is built from a fixed command, so all
apps from this template share one byte-identical layer stored **once**: the
next app costs its ~70 MB standalone layer. To skip it, set
`RUN_MIGRATIONS=false` and run `bun run db:deploy` by hand or from a deploy
pipeline before each deploy (the repository's CI does not).

### Scheduled jobs

Coolify's per-application **Scheduled Tasks**; no crontab, no scheduler:

```
Command:  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
            "$APP_URL/api/cron/example"
Schedule: 0 6 * * *
```

`src/lib/cron.ts` checks the bearer token in constant time: a cron route is a
public endpoint. Make jobs **idempotent** (schedulers retry, overlap, fire
twice) and **stagger** heavy jobs across apps: ten at 06:00 is ten pipelines
and ten pools at once.

## Backups

One instance, one backup: enable Coolify's scheduled Postgres backups to S3
when creating the database.

```bash
docker exec <postgres-container> pg_dumpall -U postgres | gzip > dump.sql.gz
```

Nightly, off-machine, restore-tested; that one file holds every app's data.

## Capacity

Idle container **~45 MB RSS**; budget 150–250 MB serving traffic with a pool,
so a dozen apps on 8 GB after Coolify and Postgres. Watch `docker stats`; when
memory tightens, add a bigger or second machine (Coolify manages several; the
shared Postgres can serve another host over a private network). Builds are the
spike: if one OOMs, build elsewhere and deploy the image.

## What gates what

`ADMIN_PASSWORD` and `ADMIN_PORT` are never set on the server: the admin panel
(`bun run admin`) is a local, loopback-only process reading the local
`DATABASE_URL`. To administer production, point a local `.env` at the
production database, on a machine you trust.

Beyond the required variables everything degrades on purpose, except:

| Left unset | Consequence |
|---|---|
| `GOOGLE_CLIENT_ID` / `SECRET` | **Nobody can sign in.** |

No variable alone fixes it: no email provider ships, so `sendMagicLink` in
`src/lib/auth.ts` *throws* in production. Fill in the Google pair or implement
`sendMagicLink` before launch. Signed out, the game still works against
`localStorage`, minus cloud saves and the leaderboard.

## If this does not fit you

An ordinary containerised Next server talking to Postgres over a URL:

- **Vercel**: works as-is, ignores the Dockerfile. Add a `vercel.json` `crons`
  block, point `DATABASE_URL` at any managed Postgres (Neon, Supabase), mind
  the 300 s ceiling (`maxDuration` is set on the example cron route).
- **Railway, Render, Fly**: they start a container; `entrypoint.sh` and
  migrate-on-boot work unchanged.
- **Plain Docker Compose**: `docker build --target runner .`, run against any
  Postgres.
