#!/bin/bash
# One-time preparation of a fresh Ubuntu VM (Oracle Cloud Always Free, Ampere
# A1), run from the cloned repository:
#
#   ./deploy/setup.sh devgame.example.com
#
# Installs Docker, opens ports 80 and 443 in the VM's own firewall, writes
# deploy/.env with generated secrets, and schedules the nightly backup. Safe to
# run again: it never overwrites an existing deploy/.env.
set -euo pipefail

domain="${1:-}"
if [ -z "$domain" ]; then
  echo "Usage: $0 <domain>   (no domain yet? <public-ip-with-dashes>.sslip.io works, see docs/hosting.md)" >&2
  exit 1
fi

here="$(cd "$(dirname "$0")" && pwd)"
env_file="$here/.env"

if ! command -v docker >/dev/null; then
  echo "-> installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# Oracle's Ubuntu images ship iptables rules that reject everything but SSH,
# on top of the VCN security list. Both must let 80 and 443 through.
echo "-> opening 80 and 443 in iptables"
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
  # shellcheck disable=SC2086 # the rule is meant to split into arguments
  sudo iptables -C INPUT $rule -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 $rule -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then
  sudo netfilter-persistent save
else
  echo "   netfilter-persistent not found: these rules will not survive a reboot" >&2
fi

if [ -f "$env_file" ]; then
  echo "-> $env_file already exists, left as it is"
else
  echo "-> writing $env_file with generated secrets"
  umask 077
  # Hex only: the Postgres password goes into DATABASE_URL unescaped.
  cat >"$env_file" <<EOF
# Production configuration. Secrets: never commit, never paste anywhere.
DOMAIN=$domain
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
DAILY_SEED_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)

# Sign-in: without Resend (or Google), nobody can sign in. See docs/hosting.md.
RESEND_API_KEY=
EMAIL_FROM=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
fi

echo "-> scheduling the nightly backup (03:30)"
line="30 3 * * * $here/backup.sh >>$HOME/devgame-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "$here/backup.sh" || true; echo "$line" ) | crontab -

cat <<EOF

Done. Next:
  1. Fill RESEND_API_KEY and EMAIL_FROM in $env_file (nano $env_file).
  2. Log out and back in, so your user is in the docker group.
  3. ./deploy/deploy.sh
EOF
