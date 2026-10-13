#!/bin/bash
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
#
# Multiplayer: the realtime server (a Bun process) runs beside the app in this
# container, because it keeps the worlds in memory and so there can be only one
# of it. Set REALTIME_ENABLED=false to run the app alone. The container lives
# as long as both do: when one exits, the other is stopped and the container
# exits with the first one's status, so the platform restarts the pair.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "-> applying migrations"
  (cd /app/migrator && ./node_modules/.bin/prisma migrate deploy)
fi

realtime_on=false
if [ -n "${DATABASE_URL:-}" ] && [ "${REALTIME_ENABLED:-true}" != "false" ] && [ "${REALTIME_ENABLED:-true}" != "0" ]; then
  realtime_on=true
fi

if [ "$realtime_on" != "true" ]; then
  exec "$@"
fi

"$@" &
app=$!
bun /app/realtime/server.js &
realtime=$!

# A stop signal is passed to both; the realtime server flushes its writes and
# closes its sockets before it exits.
trap 'kill -TERM "$app" "$realtime" 2>/dev/null || true' TERM INT

set +e
wait -n "$app" "$realtime"
status=$?
kill -TERM "$app" "$realtime" 2>/dev/null
wait "$app" "$realtime" 2>/dev/null
exit "$status"
