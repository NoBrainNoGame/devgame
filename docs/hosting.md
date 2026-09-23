# Hosting

This app is built for one specific production environment: **Coolify on a
single VPS**, hosting many unrelated apps side by side. Everything in the
repository that touches deployment — `Dockerfile`, `entrypoint.sh`,
`output: "standalone"`, `/api/health` — exists to serve that target.

It deploys to Vercel unchanged too. Read [If this does not fit
you](#if-this-does-not-fit-you) before assuming you have to follow any of this.

## Why this shape

The constraint is not the cost of one site — it is launching **a different site
regularly** and having most of them not work out. That makes two things matter
far more than they normally would:

- **Flat cost.** Anything priced per project multiplies by the number of
  experiments, most of which will be abandoned.
- **Flat effort.** If putting a new site online means hand-writing compose
  files, DNS records and TLS config, you stop launching sites.

Coolify on a VPS is the answer to both: one machine, one bill, unlimited apps,
and "new app" is a form — connect a repo, pick a domain, deploy.

|  | Vercel Pro | Coolify on a VPS |
|---|---|---|
| Cost | ~$20/mo flat, unlimited projects | ~€8/mo flat, unlimited apps |
| New app | `git push` | a form, then `git push` |
| Ops | none | yours |
| Function time limit | 300 s | none |
| Postgres | managed, per project | one instance, one database per app |
| Ceiling | none | the machine's RAM |

Vercel Pro is genuinely competitive — it is also flat, and it is less work. The
gap at ten apps is maybe €15/month. Choose Coolify for the missing time limit,
for full control of the database, and because the marginal app is free; choose
Vercel if you would rather never think about a server.

**The real recurring cost is neither**: it is domains, at ~€10/year each. See
[Wildcard DNS](#wildcard-dns) for how to make that cost zero until a site earns
a name of its own.

## The machine

Any VPS with Docker. A 4 vCPU / 8 GB instance (Hetzner CX32 and equivalents,
~€8/month at the time of writing — check, prices move) comfortably runs Coolify,
Postgres and a dozen apps of this size.

Do not start at 2 GB: Coolify itself wants ~1 GB, and you want headroom for
builds, which are the memory-hungry part.

```bash
# on a fresh Debian/Ubuntu VPS, as root
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Coolify then serves its own UI on port 8000, provisions TLS through its bundled
proxy (Traefik or Caddy), and takes over deployments.

## Wildcard DNS

Do this once, before the first app. Point a wildcard at the box:

```
*.lab.yourdomain.com.   A   <VPS IP>
```

Set that as Coolify's instance wildcard domain. Every new app then gets a
working HTTPS URL the moment you create it — no DNS record, no certificate
request, no domain purchase. A site that proves itself gets a real domain later;
one that does not costs you nothing.

At a site a week this is the single biggest ergonomic win available, and it
removes the largest line item in the whole plan.

## Postgres: one instance, many databases

Create **one** Postgres in Coolify for the whole machine, from the plain
`postgres:17-alpine` image — the same image `docker-compose.yml` uses locally.
This app's schema needs no extension, so a stock server is enough; keeping the
two environments on the same image is what stops "works locally" from meaning
anything less than "works in production".

Then give each app its own database and its own role, rather than its own
Postgres instance. Thirty containerised instances would each reserve shared
buffers and a WAL writer for a database measured in megabytes; one instance with
thirty databases is one process tree and one backup.

```sql
-- as the superuser, once per app
CREATE ROLE myapp LOGIN PASSWORD '<generated>';
CREATE DATABASE myapp OWNER myapp;
```

Raise `max_connections` on the shared instance (200 is a sane start). Every app
holds its own pool through `@prisma/adapter-pg`, and the default 100 runs out
sooner than you expect.

Point the app at it over Coolify's internal network — the database should not be
published to the host:

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

Paste the variables from `.env.example`. The required ones are `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `CRON_SECRET` and `DAILY_SEED_SECRET`; `APP_URL` and
`BETTER_AUTH_URL` must be the real public URL or the OAuth callbacks break.

`DAILY_SEED_SECRET` keys the daily seed. Rotating it changes every *future*
daily; past ones keep the seed memoised in the `DailySeed` table, so old boards
stay comparable. Losing it is not a data loss, but two deployments with
different values serve two different games of the day.

### The image is the standalone build

The `runner` stage copies `.next/standalone`, which contains only the files
Next's build traced as reachable. Anything the build cannot see is not in the
image.

That is why translations under `messages/` are loaded with a dynamic
`import()` in `src/i18n/request.ts` and never read with `fs`. File tracing
follows imports; a `readFile` of a path built at runtime is invisible to it, so
the image would build, start, pass its health check, and then return 500 on the
first localised page. Same rule for any future data file.

### Migrations run themselves

`entrypoint.sh` runs `prisma migrate deploy` before starting the server, so a
deploy is only ever a push. `migrate deploy` applies committed migrations only —
it never prompts and never resets — and Prisma takes a Postgres advisory lock,
so several replicas starting at once is safe.

If a start-up failure needs debugging, `RUN_MIGRATIONS=false` skips the step.

**The cost of this convenience is image size.** The Prisma 7 CLI weighs ~285 MB
— it eagerly requires Prisma Studio and the dev server even for
`migrate deploy`, so it cannot be pruned without breaking on the next patch
release — which puts the image around 820 MB.

That is less bad than it looks here, for two reasons. Coolify builds on the
machine that runs the app, so nothing is ever pulled over the network. And the
CLI lives in its own layer, built from a fixed command: every app built from
this template produces a byte-identical layer, which Docker stores **once** on
the host. The marginal disk cost of the next app is the ~70 MB standalone layer.

If you would rather not pay it, set `RUN_MIGRATIONS=false` and run
`bun run db:deploy` from CI or by hand before each deploy.

### Scheduled jobs

Coolify has **Scheduled Tasks** per application. There is no crontab to edit and
no separate scheduler to run:

```
Command:  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
            "$APP_URL/api/cron/example"
Schedule: 0 6 * * *
```

`src/lib/cron.ts` verifies that bearer token in constant time. A cron route is a
public endpoint that happens to be called on a schedule — nothing about being
"internal" protects it.

Two things worth doing: **make jobs idempotent** (schedulers retry, overlap, and
fire more often than expected), and **stagger apps** if several run heavy jobs —
ten jobs at 06:00 is ten pipelines and ten connection pools at once.

## Backups

One instance means one backup. Coolify can schedule Postgres backups to S3; turn
it on when you create the database, not later.

```bash
docker exec <postgres-container> pg_dumpall -U postgres | gzip > dump.sql.gz
```

Nightly, off-machine, restore-tested. A dump you have never restored is a hope,
not a backup. Every app's data is in that one file — the upside and the risk of
a shared instance.

## Capacity

An idle container from this app sits at **~45 MB RSS**; budget 150–250 MB
once it serves traffic and holds a connection pool. On 8 GB, after Coolify and
Postgres, that is comfortably a dozen apps.

Watch `docker stats`. When memory tightens, the options are a bigger machine or
a second one — Coolify manages multiple servers, and the shared Postgres can
serve apps on another host over a private network.

Builds are the spike, not the steady state. If a build OOMs on a small box,
build elsewhere and deploy the image rather than sizing the machine for its
worst minute.

## What gates what

`ADMIN_PASSWORD` and `ADMIN_PORT` are never set on the server: the admin
panel (`bun run admin`) is a local process that reads the same
`DATABASE_URL` from a developer's machine and binds to the loopback
address. Administering production means pointing a local `.env` at the
production database, on a machine you trust.

The app boots with `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET` and
`DAILY_SEED_SECRET`. Everything else degrades on purpose — but one gap is worth
knowing before you call a deployment done:

| Left unset | Consequence |
|---|---|
| `GOOGLE_CLIENT_ID` / `SECRET` | **Nobody can sign in.** |

That row is not fixable with an environment variable alone. The magic link
*throws* in production because no email provider ships with the app
(`src/lib/auth.ts`), so unless you fill in the Google OAuth pair or implement
`sendMagicLink`, your deployment has no way in. Decide which before launch, not
after.

The game itself still works signed out, against `localStorage` — what a
signed-out visitor loses is cloud saves and the leaderboard, not the game.

## If this does not fit you

Nothing here is a one-way door. The app is an ordinary containerised Next server
talking to Postgres over a URL:

- **Vercel**: works as-is. Add a `vercel.json` with a `crons` block, point
  `DATABASE_URL` at any managed Postgres (Neon, Supabase — the schema needs no
  extension), and note the 300 s function ceiling — `maxDuration` is already
  declared on the example cron route. Vercel ignores the Dockerfile.
- **Railway, Render, Fly**: all start a container, so `entrypoint.sh` and the
  migrate-on-boot behaviour work unchanged.
- **Plain Docker Compose**: `docker build --target runner .` and run it against
  any Postgres. Coolify is a convenience, not a dependency.
