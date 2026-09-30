#!/bin/sh
# Nightly backup of the database and the website editor's uploaded images.
# Runs as the "backup" service in docker-compose.prod.yml:
#   backup.sh          one backup now
#   backup.sh --nightly  one backup every day at BACKUP_AT (UTC)
# Each backup is one file, console-<time>.tar(.enc), holding console.dump
# (pg_dump custom format) and media.tar.gz. Restoring is in docs/deploy.md.
# With OFFSITE_S3_BUCKET set, each file is also copied off the server with
# rclone (remote "offsite", set up from RCLONE_CONFIG_OFFSITE_* in
# docker-compose.prod.yml), and off-site copies older than
# BACKUP_KEEP_DAYS are deleted there too.
set -eu

dir=${BACKUP_DIR:-/backups}
media=${MEDIA_DIR:-/media}
keep=${BACKUP_KEEP_DAYS:-30}

backup() {
  stamp=$(date -u +%Y%m%d-%H%M%S)
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  pg_dump --format=custom --file="$work/console.dump" "$DATABASE_URL"
  tar -C "$media" -czf "$work/media.tar.gz" .
  mkdir -p "$dir"
  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    out="$dir/console-$stamp.tar.enc"
    tar -C "$work" -cf - console.dump media.tar.gz | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$out.part"
  else
    echo "backup: BACKUP_PASSPHRASE is not set, so this backup is not encrypted" >&2
    out="$dir/console-$stamp.tar"
    tar -C "$work" -cf "$out.part" console.dump media.tar.gz
  fi
  mv "$out.part" "$out"
  rm -rf "$work"
  trap - EXIT
  find "$dir" -maxdepth 1 -name 'console-*' -type f -mtime +"$keep" -delete
  echo "backup: wrote $out ($(du -h "$out" | cut -f1))"
  if [ -n "${OFFSITE_S3_BUCKET:-}" ]; then
    remote="offsite:$OFFSITE_S3_BUCKET/${OFFSITE_S3_PREFIX:-console}"
    rclone -q copy --no-traverse "$out" "$remote/"
    rclone -q delete --min-age "${keep}d" "$remote/" || echo "backup: could not prune old off-site copies" >&2
    echo "backup: copied off-site to $remote/$(basename "$out")"
  fi
}

if [ "${1:-}" != "--nightly" ]; then
  backup
  exit 0
fi

at=${BACKUP_AT:-23:00}
echo "backup: every day at $at UTC into $dir, keeping $keep days"
last=""
while true; do
  if [ "$(date -u +%H:%M)" = "$at" ] && [ "$(date -u +%F)" != "$last" ]; then
    last=$(date -u +%F)
    # Its own process, so any failing step stops that backup (set -e) but not the loop.
    "$0" || echo "backup: FAILED on $last" >&2
  fi
  sleep 20
done
