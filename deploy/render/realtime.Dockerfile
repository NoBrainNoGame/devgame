# syntax=docker/dockerfile:1.7

# The realtime server alone, for a platform that runs one process per service
# (Render's free web service). The site itself runs elsewhere (Vercel), so this
# image skips `next build` entirely: dependencies, the Prisma client, then the
# one-file Bun bundle of src/realtime/server.ts, the same `realtime:build` the
# main Dockerfile runs. See docs/hosting.md, "Vercel + Render".

ARG BUN_VERSION=1.3.14
ARG NODE_VERSION=22

FROM oven/bun:${BUN_VERSION}-slim AS bun

# Same base as the main Dockerfile: Node for the Prisma CLI that postinstall
# runs, Bun as the package manager and bundler.
FROM node:${NODE_VERSION}-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

COPY package.json bun.lock prisma7.config.ts ./
COPY prisma ./prisma
# `prisma generate` (postinstall) reads a URL it never connects to.
ENV DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder
RUN bun install --frozen-lockfile

COPY . .
RUN bun run realtime:build

# ---------------------------------------------------------------------------
# The bundle is self-contained (Prisma's query compiler is inlined WASM), so
# the runtime image is Bun and one file.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS realtime
WORKDIR /app
COPY --from=build /app/dist/realtime ./realtime

# Render routes to $PORT (10000 by default); the server listens on
# REALTIME_PORT, so both point at the same number.
ENV NODE_ENV=production \
    PORT=10000 \
    REALTIME_PORT=10000
EXPOSE 10000

USER bun
CMD ["bun", "realtime/server.js"]
