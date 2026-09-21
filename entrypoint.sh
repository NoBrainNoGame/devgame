#!/bin/sh
# Apply migrations, then hand off to the server.
#
# Running migrations here rather than as a separate deploy step is what makes
# "deploy = push" true on Coolify, Dokploy, Railway and friends: they all just
# start a container. `prisma migrate deploy` applies committed migrations only —
# it never prompts and never resets — and Prisma takes a Postgres advisory lock,
# so several replicas starting at once is safe.
#
# The CLI, the schema and the Prisma config are self-contained in /app/migrator;
# see the Dockerfile for why.
#
# Set RUN_MIGRATIONS=false to skip this (for a replica that should not migrate,
# or to debug a start-up failure).
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "-> applying migrations"
  (cd /app/migrator && ./node_modules/.bin/prisma migrate deploy)
fi

exec "$@"
