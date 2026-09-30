#!/usr/bin/env bash
# Rehearses production on a scratch folder, with the real deploy scripts
# (run by CI on every change; needs Docker):
#   1. a first deploy onto an empty database;
#   2. creating the staff Admin from the command line;
#   3. a second deploy, which backs up first;
#   4. a release that never becomes healthy, which must roll back to (3);
#   5. a restore test from the off-site copy (a folder here, S3 in production);
#   6. a backup and restore test while off-site storage is not set up yet
#      (bucket named but no access key), which must stay on the server.
set -euo pipefail
cd "$(dirname "$0")/.."

home=$(mktemp -d)/console
mkdir -p "$home/incoming"
export CONSOLE_HOME=$home
cat > "$home/.env" <<ENV
APP_URL=https://console.example.test
MAIL_FROM="Fourth Generation Technologies <no-reply@example.test>"
SMTP_URL=smtp://mail.invalid:25
SUPPORT_EMAIL=support@example.test
POSTGRES_PASSWORD=$(openssl rand -hex 16)
TOTP_ENCRYPTION_KEY=$(openssl rand -base64 32)
PAYLOAD_SECRET=$(openssl rand -base64 32)
BACKUP_PASSPHRASE=$(openssl rand -hex 16)
BILLING_ADAPTER=whmcs
WHMCS_ENVIRONMENT=production
WHMCS_API_URL=https://whmcs.invalid/includes/api.php
WHMCS_API_IDENTIFIER=rehearsal
WHMCS_API_SECRET=rehearsal
WHMCS_SYNC_SECRET=rehearsal
TENANT_PROVIDER=manual
PAYMENT_ADAPTER=stub
OFFSITE_TYPE=local
OFFSITE_S3_BUCKET=/backups/offsite
ENV

step() { printf '\n== %s\n' "$*"; }
pack() { git archive --format=tar.gz -o "$home/incoming/$1.tar.gz" HEAD; }
live() { curl -fsS http://127.0.0.1:3000/api/health; }
cleanup() { docker compose -p console -f docker-compose.prod.yml --env-file "$home/.env" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

step "1. First deploy onto an empty database"
pack one && bash deploy/deploy.sh one "$home/incoming/one.tar.gz"
live | grep -q '"release":"one"'

step "2. Create the staff Admin"
printf 'rehearsal passphrase 2026\n' | docker compose -p console -f "$home/current/docker-compose.prod.yml" --env-file "$home/.env" exec -T app node ops.cjs create-admin "Rehearsal Admin" admin@example.test

step "3. Second deploy (backs up first)"
pack two && bash deploy/deploy.sh two "$home/incoming/two.tar.gz"
live | grep -q '"release":"two"'
ls "$home/backups" | grep -q '^console-' || { echo "no backup was taken before the second deploy"; exit 1; }

step "4. A release that never becomes healthy rolls back"
work=$(mktemp -d) && git archive HEAD | tar -x -C "$work"
echo 'CMD ["sh", "-c", "echo broken on purpose; exit 1"]' >> "$work/Dockerfile"
tar -czf "$home/incoming/broken.tar.gz" -C "$work" . && rm -rf "$work"
if bash deploy/deploy.sh broken "$home/incoming/broken.tar.gz"; then echo "the broken release was reported healthy"; exit 1; fi
live | grep -q '"release":"two"'
[[ $(cat "$home/current-release") == two ]]

step "5. Restore test from the off-site copy"
bash deploy/console restore-test | tee "$home/restore.log"
grep -q "restore-test: OK" "$home/restore.log"
grep -q "users 1," "$home/restore.log"

step "6. Backups stay on the server while off-site storage is not set up"
no_offsite=(-e RCLONE_CONFIG_OFFSITE_TYPE=s3 -e RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID= -e OFFSITE_S3_BUCKET=fgt-console-backups)
docker compose -p console -f "$home/current/docker-compose.prod.yml" --env-file "$home/.env" run --rm "${no_offsite[@]}" backup /backup.sh | tee "$home/local.log"
grep -q "on the server only" "$home/local.log"
docker compose -p console -f "$home/current/docker-compose.prod.yml" --env-file "$home/.env" run --rm "${no_offsite[@]}" backup /restore-test.sh | tee "$home/local-restore.log"
grep -q "testing the copy on the server" "$home/local-restore.log"
grep -q "restore-test: OK" "$home/local-restore.log"

step "Rehearsal passed"
