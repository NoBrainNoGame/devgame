# Hosting

Target: **Coolify on a single VPS** hosting many unrelated apps; `Dockerfile`,
`entrypoint.sh`, `output: "standalone"` and `/api/health` exist for it. Vercel
also works unchanged ([below](#if-this-does-not-fit-you)).
For a single app on a free machine, [one VM with Docker](#one-vm-with-docker)
runs the same image without Coolify.

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

### The realtime server

Multiplayer needs a second process: `bun run realtime`, bundled by
`bun run realtime:build` into `dist/realtime/server.js`. The image carries Bun
and the bundle, and `entrypoint.sh` runs both processes: when one exits the
other is stopped and the container exits with the first one's status, so the
platform restarts the pair. `EXPOSE 3000 3200`; the healthcheck covers both.

- **One replica.** The worlds live in the realtime server's memory (they are
  replayed from Postgres at boot, not shared), so a second replica would be a
  second world with the same clock. Scale the app, never this.
- **Domain or port.** Browsers reach it at `REALTIME_URL` (a `wss://` host, e.g.
  a second domain proxied to port 3200) or, unset, at `APP_URL`'s host on
  `REALTIME_PORT`. The proxy must forward WebSocket upgrades and keep idle
  connections for at least a minute (the client pings every 20 s).
- **Memory.** A company's state is a few hundred KB; 64 companies per world is
  the cap (`REALTIME_LIMITS`), well inside a small VPS.
- **Off.** `REALTIME_ENABLED=false` (or no `DATABASE_URL`) runs the app alone:
  the Multi link and the pages disappear and `/api/realtime/ticket` is a 404.
- **Restarts.** A stop signal makes the server flush its writes before it
  exits; players reconnect on their own and are re-seated. A deploy costs
  the seconds it takes to boot.

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
| `GOOGLE_CLIENT_ID` / `SECRET` **and** `RESEND_API_KEY` / `EMAIL_FROM` | **Nobody can sign in.** |

The magic link goes out through Resend (`src/lib/email.ts`) when
`RESEND_API_KEY` and `EMAIL_FROM` are set; without them `sendMagicLink`
*throws* in production. Set Resend, the Google pair, or both before launch.
Signed out, the game still works against `localStorage`, minus cloud saves and
the leaderboard.

## One VM with Docker

`deploy/` runs the production image on one machine with no platform: the app
and its realtime server in one container, Postgres beside it, Caddy in front
for HTTPS. Written for **Oracle Cloud Always Free** (an Ampere A1 VM, arm64,
which the Dockerfile builds for), it works on any Ubuntu box with Docker.

| File | Role |
|---|---|
| `compose.yml` | app, Postgres, Caddy; only Caddy publishes ports (80, 443) |
| `Caddyfile` | certificate for `$DOMAIN`; `/realtime/*` to port 3200, the rest to 3000 |
| `setup.sh` | once: Docker, firewall, `deploy/.env` with generated secrets, backup cron |
| `deploy.sh` | each deploy: `git pull`, rebuild, restart (migrations run at boot) |
| `backup.sh` | nightly `pg_dump`, 14 days kept, in `~/devgame-backups` |

The realtime server shares the site's host (`REALTIME_URL` = `APP_URL`, socket
at `wss://<domain>/realtime/ws`): one certificate, and its origin check sees
the site's own origin. `deploy/.env` holds the secrets: never committed
(`.env*`), kept out of the image (`.dockerignore`), readable by its owner only.

### Oracle Cloud, once

1. **Instance**: Compute → Create instance, image **Ubuntu 24.04**, shape
   **VM.Standard.A1.Flex** (Always Free allows up to 4 OCPU / 24 GB in total;
   2 OCPU / 12 GB is plenty). Add your SSH key. If the region has no A1
   capacity, retry later or pick another availability domain.
2. **Ports**: the instance's VCN → Security List → Ingress rules from
   `0.0.0.0/0`: TCP 80, TCP 443, UDP 443. The VM's own iptables also rejects
   them; `setup.sh` opens those.
3. **Domain**: an A record to the instance's public IP. With no domain yet,
   `<ip-with-dashes>.sslip.io` (e.g. `129-151-1-2.sslip.io`) resolves to that
   IP with no setup, and Let's Encrypt issues for it.
4. **Idle reclaim**: Oracle may reclaim an Always Free instance that stays
   nearly idle for a week. Upgrading the account to Pay As You Go (still free
   within the Always Free limits) exempts it.

### On the VM

```bash
git clone https://github.com/NoBrainNoGame/devgame.git && cd devgame
./deploy/setup.sh devgame.example.com
nano deploy/.env        # RESEND_API_KEY, EMAIL_FROM (and Google if wanted)
exit                    # log back in: the docker group applies to new sessions
cd devgame && ./deploy/deploy.sh
```

The first build takes several minutes. `docker compose -f deploy/compose.yml
logs -f app` shows the migrations, then both servers starting. Each later
deploy is `./deploy/deploy.sh` again.

- **Resend**: verify the sending domain (DNS records Resend gives you), create
  an API key, set `EMAIL_FROM=Devgame <login@that-domain>`. An sslip.io name
  cannot be verified: sending needs a domain you own.
- **Google**: authorised redirect URI
  `https://<domain>/api/auth/callback/google`.
- **Restore**: `gunzip -c ~/devgame-backups/<file>.sql.gz | docker compose -f
  deploy/compose.yml --env-file deploy/.env exec -T postgres psql -U devgame -d
  devgame`. The dumps sit on the same VM: copy them elsewhere (OCI Object
  Storage has a free tier) to survive losing the machine.
- **Legal pages**: the host and the email provider are named in
  `messages/*.json` (`legal.publisher.hostName`, `emailProvider`, …).

## Vercel + Render (free, multiplayer included)

What runs `devgame.nobrainnogame.ghom.fr`: the site on Vercel (Hobby), the
realtime server on Render (free web service), Postgres on Neon (free). No
machine to look after; the price is a realtime server that sleeps.

| Piece | Where | Config |
|---|---|---|
| Site (Next.js) | Vercel, region `fra1` | `vercel.json` |
| Realtime server | Render, Frankfurt | `render.yaml`, `deploy/render/realtime.Dockerfile` |
| Postgres | Neon, Frankfurt | its own project (quotas apart from other apps) |

- **Migrations** run in Vercel's build (`vercel.json`), over
  `DATABASE_URL_UNPOOLED`: Neon's pooled URL cannot hold Prisma Migrate's
  advisory lock. The app itself uses the pooled `DATABASE_URL`.
- **The realtime image** skips `next build`: dependencies, the Prisma client,
  then the same `realtime:build` bundle as the main Dockerfile, run by Bun.
  Render routes to port 10000, so `PORT` and `REALTIME_PORT` both say 10000.
- **Shared secrets**: `BETTER_AUTH_SECRET` signs the tickets the site hands
  out and the realtime server checks, and `DAILY_SEED_SECRET` is validated by
  both: same values on both platforms. The realtime server only accepts the
  origin of `APP_URL`.
- **It sleeps.** A free Render service stops after 15 minutes without traffic;
  the first player after that waits about a minute while it boots and replays
  the worlds from Postgres. Do not add a keep-alive ping: a server that never
  sleeps keeps Neon's compute awake too, and the free compute quota runs out.

### Variables

Vercel (Production):

```
DATABASE_URL=<Neon, pooled>
DATABASE_URL_UNPOOLED=<Neon, direct>
APP_URL=https://devgame.nobrainnogame.ghom.fr
BETTER_AUTH_URL=https://devgame.nobrainnogame.ghom.fr
BETTER_AUTH_SECRET=<shared>
DAILY_SEED_SECRET=<shared>
CRON_SECRET=<any, 16+ characters>
REALTIME_URL=https://<the Render service>.onrender.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Render asks for `DATABASE_URL`, `BETTER_AUTH_SECRET` and `DAILY_SEED_SECRET`
when the Blueprint is created; `render.yaml` sets the rest.

Google: authorised JavaScript origin `https://devgame.nobrainnogame.ghom.fr`,
redirect URI `https://devgame.nobrainnogame.ghom.fr/api/auth/callback/google`.

## If this does not fit you

An ordinary containerised Next server talking to Postgres over a URL:

- **Vercel**: works as-is, ignores the Dockerfile. Add a `vercel.json` `crons`
  block, point `DATABASE_URL` at any managed Postgres (Neon, Supabase), mind
  the 300 s ceiling (`maxDuration` is set on the example cron route).
- **Railway, Render, Fly**: they start a container; `entrypoint.sh` and
  migrate-on-boot work unchanged.
- **Plain Docker Compose**: `docker build --target runner .`, run against any
  Postgres.
