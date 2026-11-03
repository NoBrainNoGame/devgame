#!/bin/bash
# Deploy what is on the current branch: pull, rebuild, restart. Migrations
# apply themselves when the app container starts (entrypoint.sh).
#
#   ./deploy/deploy.sh            # pull, then build and restart
#   ./deploy/deploy.sh --no-pull  # build and restart what is checked out
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
compose=(docker compose --file "$here/compose.yml" --env-file "$here/.env")

if [ ! -f "$here/.env" ]; then
  echo "$here/.env is missing: run ./deploy/setup.sh <domain> first." >&2
  exit 1
fi

if [ "${1:-}" != "--no-pull" ]; then
  git -C "$here/.." pull --ff-only
fi

"${compose[@]}" up --detach --build --remove-orphans
# Each build leaves the previous image behind; a small disk fills up fast.
docker image prune --force >/dev/null

"${compose[@]}" ps
echo "Logs: docker compose -f $here/compose.yml logs -f app"
