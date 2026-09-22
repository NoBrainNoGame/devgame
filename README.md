# Devgame

A browser roguelike whose dungeon is a **Git graph written as you play**. You
are a developer on a project that never ships. Every sprint brings tickets;
every ticket is story points to fill, one commit at a time; every commit is a
choice between writing it yourself and letting the machine write it. The
review decides what lands, production decides whether you keep your job, and
the money your features earn buys you the team and the tooling to hold on a
little longer.

<img width="2512" height="1838" alt="A run: the git graph in the middle, the ticket bar above, the actions on the right" src="https://github.com/user-attachments/assets/ee8e9f08-fefd-4004-8275-7fe178f36d4f" />

There is no end. A run stops in **burnout** (you ran out of energy) or with
**production firing you** (it ran out of patience). The score is what you held.

## The game in one page

**Two hands.** A craft commit costs energy, fills one story point and almost
always lands. A machine commit costs one energy, fills three points, fails
more often, adds technical debt and — unread — ships bugs. Every roll's odds,
cost, points and debt are printed on the card before you choose.

**Tickets, not paths.** Nothing on the graph exists before it is written. A
ticket is a demand with story points; its commits appear in its own column as
you write them, forking from `dev` and merging back. `main` only ever receives
the sprint merge and the release.

**The review has the floor.** Points full, the ticket goes to review. The
reviewer reads every machine commit nobody read, catches bugs at a rate, and
refuses a codebase over its debt ceiling. Accepted, *you* press merge and the
merge costs the turn. Refused, the caught commits are flagged, the next
backlog ticket opens beside yours so the sprint keeps its rhythm, and you
choose: start over (`git reset --hard`) or carry on and fix.

**Every detour has a target.** A *fix* is offered only when the review flagged
a commit, and takes the oldest bug out. A *refactor* is offered only when a
commit on the ticket cost debt — every commit remembers what it cost — and
takes exactly that back. *Squash* needs unread machine commits, *rebase* needs
`dev` to have moved. *Docs* and *risky* are always there.

**Two gauges, two endings.** Energy is spent by commits and reviews, returned
by merges and by *taking a breath* — a turn without code that gives less back
for every extra ticket you hold, so a crowded board is one you cannot rest on.
Production's patience fills on incidents, on refused reviews and on every
backlog ticket a sprint had to force on you; a clean sprint brings it down.

**The backlog is the enemy.** Tickets arrive every sprint, more of them as the
run goes on. A ticket left waiting past its grace sprint is assigned to you
anyway. Every open ticket beyond the first taxes energy and takes a percentage
off every roll. Hotfixes forced open by production do not count: the ticket is
the punishment.

**The company.** Every feature shipped earns monthly revenue for the rest of
the run, three paydays a sprint. Money buys servers (how many features
production can carry), marketing, tooling, an AI supervisor, skill points at a
rising price, and **developers** who take the oldest backlog features and land
them alone — one at a time for a junior, two for a mid, three for a senior —
and leave if you cannot pay them. A four-branch **skill tree** (CI/CD, DevOps,
Management, Profile) spends the points a sprint earns.

**Measured, not guessed.** `bun run sim` plays hundreds of headless runs per
policy. The current numbers give every way of playing both endings: the
machine played with reviews delivers the most and gets fired for it, the
crafting hand splits evenly between the two, and the machine played blind dies
in three sprints.

The full specification is [docs/game-design.md](docs/game-design.md); the
engine implements it, and a rule contradicting the doc is a bug in one of the
two.

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
  energy costs, success rates, story points, debt gains, ticket cadence,
  production's patience, revenue. A literal inside a rule is a bug waiting to
  be untunable.
- **Readable randomness.** Success percentage, energy cost, points and debt
  are shown before you choose. Technical debt is shown as a fuzzy range, exact
  once you have the Linter or Œil de lynx.
- **A git graph drawn like a git client.** Continuous lanes, refs in a gutter,
  conventional-commit subjects, revealed at the pace of the effects.
- **An idle clock.** Left alone, the run keeps moving: the rest button presses
  itself, and with the AI supervisor bought it plays the obvious move. Those
  are ordinary actions in the run's log; nothing in the engine reads the clock.
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
    landing/     the git graph on the landing page
    game/        the canvas mount point
    hud/         resource bar, ticket bar, action panel, board, review,
                 company, skill tree, info column, log drawer
  game/
    core/        pure deterministic rules — no Pixi, no React, no clock
    content/     data tables: skills, relics, tree, upgrades, team, events
    dto/         zod schemas and the server-side replay
    chips/       booyah flow — scene tree, camera, effect queue
    render/      Pixi 8 — the git graph, theme, coordinates, storyboard
    bridge/      zustand store, snapshot and mountGame()
  i18n/          routing, navigation, request config
  lib/           env, db, auth, session, cron, server actions, storage
tests/           bun:test
docs/            game design, maintenance, database, hosting
```

`CLAUDE.md` documents the invariants; read it before changing anything under
`src/game/` or `src/lib/`. [docs/maintenance.md](docs/maintenance.md) is the
maintainer's manual: how to add a game element, change a rule, version a save
or move a DTO, and what silently breaks when a step is skipped.

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
