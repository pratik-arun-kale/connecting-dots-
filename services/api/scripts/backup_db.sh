#!/bin/sh
# Back up the database (and the on-disk search index) and prune old backups.
# Run nightly from cron or the host's scheduler; see docs/runbook.md.
#
#   POSTGRES_HOST / POSTGRES_PORT / POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD
#                         the same variables the API uses
#   BACKUP_DIR            where backups go (default ./backups)
#   BACKUP_KEEP_DAYS      delete local backups older than this (default 14)
#   BACKUP_DATA_DIR       the API's data/ folder (vector store + vocabulary);
#                         archived too when it exists (default ./data)
#   BACKUP_S3_URI         optional, e.g. s3://my-bucket/connecting-dots; each
#                         backup is copied there with the aws CLI. Expire old
#                         copies with a bucket lifecycle rule (14 days).
#
# Exit status is non-zero on any failure, so a scheduler can alert on it.
set -eu

: "${POSTGRES_HOST:=localhost}" "${POSTGRES_PORT:=5432}" "${POSTGRES_DB:=ai_context_workspace}"
: "${POSTGRES_USER:=postgres}" "${BACKUP_DIR:=./backups}" "${BACKUP_KEEP_DAYS:=14}" "${BACKUP_DATA_DIR:=./data}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"
dump="$BACKUP_DIR/db-$stamp.dump"

# Custom format: compressed, and pg_restore can restore all or part of it.
pg_dump --format=custom --no-owner --no-privileges \
  --host="$POSTGRES_HOST" --port="$POSTGRES_PORT" --username="$POSTGRES_USER" \
  --file="$dump.partial" "$POSTGRES_DB"
pg_restore --list "$dump.partial" > /dev/null   # refuse to keep an unreadable dump
mv "$dump.partial" "$dump"
echo "database: $dump ($(wc -c < "$dump") bytes)"

files="$dump"
if [ -d "$BACKUP_DATA_DIR" ]; then
  archive="$BACKUP_DIR/data-$stamp.tar.gz"
  # Through stdout: GNU tar reads "C:/..." in -f as a remote host.
  tar -cz -C "$(dirname "$BACKUP_DATA_DIR")" "$(basename "$BACKUP_DATA_DIR")" > "$archive"
  echo "search index: $archive ($(wc -c < "$archive") bytes)"
  files="$files $archive"
fi

if [ -n "${BACKUP_S3_URI:-}" ]; then
  for f in $files; do
    aws s3 cp --only-show-errors "$f" "${BACKUP_S3_URI%/}/$(basename "$f")"
  done
  echo "copied to $BACKUP_S3_URI"
fi

# Local retention. Only files this script wrote are ever deleted.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'data-*.tar.gz' \) \
  -mtime +"$BACKUP_KEEP_DAYS" -print -delete | sed 's/^/pruned: /'
