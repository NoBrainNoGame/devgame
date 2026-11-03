#!/bin/bash
# Nightly dump of the database, kept for 14 days. Scheduled by setup.sh.
#
# The dumps sit on the same VM as the database: they cover a bad migration or
# a deleted row, not a lost machine. Copy them off the VM (OCI Object Storage
# has a free tier) for that; docs/hosting.md says how to restore.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
dir="${BACKUP_DIR:-$HOME/devgame-backups}"
mkdir -p "$dir"

file="$dir/devgame-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose --file "$here/compose.yml" --env-file "$here/.env" \
  exec -T postgres pg_dump --username devgame --dbname devgame --clean --if-exists \
  | gzip >"$file.partial"
# Renamed only once complete, so a failed dump never passes for a good one.
mv "$file.partial" "$file"

find "$dir" -name 'devgame-*.sql.gz' -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup written: $file"
