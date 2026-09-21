# syntax=docker/dockerfile:1.7

# Production image. See docs/hosting.md for the deployment it targets.
#
# Bun owns dependency resolution, because bun.lock is the only lockfile in the
# repo. Node runs `next build` and serves the result: Bun 1.3.x segfaults on
# exit from a Next build on linux/arm64 — after the build has succeeded — and a
# step that crashes on success cannot signal failure. Copying Bun's binary into
# the Node image gets both without a second base image.
#
# Nothing in the served graph is a native addon: Prisma 7 runs its query
# compiler as inlined WASM through the `pg` driver adapter.

ARG BUN_VERSION=1.3.14
ARG NODE_VERSION=22

FROM oven/bun:${BUN_VERSION}-slim AS bun

# ---------------------------------------------------------------------------
# base — Node with Bun available as a package manager.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
# deps — node_modules, including the Prisma client that postinstall generates.
# ---------------------------------------------------------------------------
FROM base AS deps

# `postinstall` runs `prisma generate`, so the schema and the Prisma config have
# to be in place before install, not after it.
COPY package.json bun.lock prisma7.config.ts ./
COPY prisma ./prisma

# `prisma generate` reads the datasource URL from prisma7.config.ts even though
# it never connects. A syntactically valid placeholder is enough.
ENV DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder

RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# migrator-deps — just the Prisma CLI, so the runtime image stays small.
# ---------------------------------------------------------------------------
# `prisma migrate deploy` runs at container start (see entrypoint.sh), which is
# what makes deploying a git push. Installing the CLI on its own keeps that to
# a few tens of MB instead of dragging in every build dependency.
FROM base AS migrator-deps
RUN bun init -y >/dev/null 2>&1 \
 && bun add prisma@7.10.0 dotenv@17.4.2

# ---------------------------------------------------------------------------
# builder — `next build`, run by Node rather than through `bun run`.
# ---------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# src/lib/env.ts validates at import time and `next build` imports the entire
# server graph, so the build needs a well-shaped environment even though it
# never opens a socket: every page is `force-dynamic` and no NEXT_PUBLIC_* is
# read, so none of this is baked into the output. The container gets its real
# values at run time.
#
# A new *required* variable in env.ts must be added here too, or the image
# stops building.
ENV NODE_ENV=production \
    DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder \
    BETTER_AUTH_SECRET=build-time-placeholder-not-a-real-secret \
    CRON_SECRET=build-time-placeholder-not-a-real-secret \
    DAILY_SEED_SECRET=build-time-placeholder-not-a-real-secret

RUN node ./node_modules/.bin/next build

# ---------------------------------------------------------------------------
# runner — what actually serves traffic.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Prisma's schema engine probes for libssl at start-up and warns loudly on every
# deploy when it cannot identify it. One package silences it for good.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# The three halves of a standalone build: the traced server, the client assets
# it serves itself, and public/.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations run at start-up (see entrypoint.sh), so the schema and a Prisma CLI
# have to ship too. They live together under /app/migrator, self-contained: the
# config file is TypeScript and imports dotenv, so it only resolves if its own
# node_modules is the nearest one above it. Keeping it out of /app also stops it
# colliding with the standalone server's traced node_modules.
COPY --from=migrator-deps --chown=nextjs:nodejs /app/node_modules ./migrator/node_modules
COPY --chown=nextjs:nodejs prisma ./migrator/prisma
COPY --chown=nextjs:nodejs prisma7.config.ts ./migrator/
COPY --chown=nextjs:nodejs entrypoint.sh ./
RUN chmod +x entrypoint.sh

USER nextjs
EXPOSE 3000

# Shallow on purpose: it answers from the event loop without touching Postgres,
# so a database outage does not make the orchestrator kill a healthy process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
