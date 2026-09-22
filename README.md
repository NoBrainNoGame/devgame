# Devgame

A browser roguelike RPG whose dungeon is a **Git graph** written as you play.
You play a developer advancing commit by commit on a project that never ships:
every commit is a choice between a craft commit (safe, expensive in energy) and
an AI commit (cheap, fills twice the story points, accrues hidden technical
debt and ships bugs if nobody reads it). Tickets arrive every sprint with
points to fill and acceptance criteria to hold, the ones you leave waiting get
assigned to you anyway, and every ticket you hold beyond the first taxes every
commit. Tickets you deliver become permanent skills, a turn spent on code
review repays debt, and DevOps points automate away whole mechanics.

Runs are infinite sprints. They end in burnout, or with production firing you.

## Stack

Bun 1.3 · Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) ·
Tailwind CSS 4 + shadcn/ui (dark only) · Zustand 5 · Zod 4 · Biome 2.5 ·
next-intl 4 (FR default, EN) · Pixi.js 8 · @ghom/booyah 1.3 · Prisma 7 +
PostgreSQL 17 · Better Auth

## Getting started

```bash
bun install
cp .env.example .env

openssl rand -hex 32        # -> BETTER_AUTH_SECRET
openssl rand -hex 32        # -> CRON_SECRET
openssl rand -hex 32        # -> DAILY_SEED_SECRET

bun run db:up               # Postgres 17 on port 5443
bun run db:migrate          # create and apply migrations
bun run dev                 # http://localhost:3000
```

Minimum to boot: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET`,
`DAILY_SEED_SECRET`. `src/lib/env.ts` validates them at import time, so a
missing one fails at start-up with a message naming it.

The game itself needs no account: `/play` works signed out, against
`localStorage`. Signing in is what buys you cloud saves and the leaderboard.

**Signing in.** In development the magic link is printed to the server log —
copy it from the terminal and paste it into the browser. No email provider is
wired, so `sendMagicLink` in `src/lib/auth.ts` throws in production: until you
implement it or fill in the Google OAuth pair, nobody can sign in to a deployed
instance. Decide which before launch, not after.

## Commands

```bash
bun run check       # typecheck + lint + tests — run this before you are done
bun run dev         # dev server
bun run build       # production build
bun run sim         # headless balance simulator (scripts/sim.ts)
bun run db:up       # start Postgres (POSTGRES_PORT=5500 to move the port)
bun run db:migrate  # create and apply a migration
bun run db:deploy   # apply committed migrations
bun run db:studio   # browse the data
```

`bun run sim` plays runs without a renderer, over many seeds and a fixed policy,
to catch states the engine cannot leave and to produce balance statistics. It is
the only way to tell whether a number in `balance.ts` is wrong before a human
plays fifty runs.

## What you get

- **A pure rules engine.** `src/game/core/` has no Pixi, no React, no clock and
  no `Math.random()`: randomness comes from a seeded PRNG carried in the run
  state. The same seed and the same actions always produce the same run.
- **Every number in one file.** `src/game/core/balance.ts` holds the tunables —
  energy costs, success rates, story points, debt gains, ticket cadence. A
  literal inside a rule is a bug waiting to be untunable.
- **Readable randomness.** Success percentage, energy cost and effects are shown
  before you choose. Technical debt is shown as a fuzzy range, exact once you
  have the Linter or Œil de lynx.
- **Cloud saves and a leaderboard** derived from the runs table, with a daily
  seed mode: everyone plays the same map on the same UTC day.
- **FR and EN** through next-intl. The engine emits `{ key, params }`, never
  strings; React and the Pixi scene translate.
- **A production image** — multi-stage Dockerfile, non-root, healthchecked, with
  migrations applied at container start.

## How a run is stored

A run is its **seed plus the ordered list of player actions** — nothing else. No
board state, no score, no snapshot. That has three consequences worth knowing
before you touch the engine:

- Saves are tiny, so autosave is cheap and works in `localStorage` too.
- Scores are not forgeable: `submitRun` replays the action log server-side and
  writes what the engine computed. No DTO carries a score field; the number the
  client shows is a preview.
- The engine must stay deterministic. A `Date.now()` in a rule makes yesterday's
  runs unreplayable and silently breaks the leaderboard.

## Layout

```
messages/        fr.json (source of truth) and en.json
prisma/          schema and migrations
scripts/         sim.ts — headless balance simulator
src/
  app/[locale]/
    (site)/      landing, leaderboard, profile, login — scrolls, has a footer
    (app)/play/  the run — fills the window, never scrolls
  app/api/       auth, health, cron — outside the locale segment
  components/
    ui/          shadcn primitives
    shell/       header, footer, locale switch, auth menu
    game/        the canvas mount point
    hud/         resource bar, action panel, commit log, dialogs
  game/
    core/        pure deterministic rules — no Pixi, no React, no clock
    content/     data tables: skills, relics, criteria, DevOps, events, profiles
    dto/         zod schemas and the server-side replay
    chips/       booyah flow — scene tree, camera, effect queue
    render/      Pixi 8 — the git graph, theme, coordinates
    bridge/      zustand store, snapshot and mountGame()
  i18n/          routing, navigation, request config
  lib/           env, db, auth, session, cron, server actions, storage
tests/           bun:test
docs/            game design, database, hosting
```

`docs/game-design.md` is the consolidated spec — the engine implements it, and a
rule contradicting the doc is a bug in one of the two. `CLAUDE.md` documents the
invariants; read it before changing anything under `src/game/` or `src/lib/`.
[docs/maintenance.md](docs/maintenance.md) is the maintainer's manual: how to
add a game element, change a rule, version a save or move a DTO, and what
silently breaks when a step is skipped.

## Deployment

Built for **Coolify on a single VPS**: migrations run at container start, so
deploying is a push. It also runs unchanged on Vercel, Railway, Render, Fly or
plain Docker.

```bash
docker build --target runner -t devgame .
docker run -p 3000:3000 --env-file .env devgame
```

Read [docs/hosting.md](docs/hosting.md) — it covers the machine, the wildcard
DNS trick, the one-Postgres-many-databases layout, scheduled jobs, backups and
capacity. [docs/database.md](docs/database.md) covers the schema, the index
rules and the one index Prisma cannot express.

## Licence

MIT.
