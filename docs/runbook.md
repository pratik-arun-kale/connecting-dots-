# Connecting Dots — Runbook

How to back up, restore and look after a running Connecting Dots API. Commands run from `services/api` with the same environment variables the API uses (`POSTGRES_*`, see `.env.example`).

## Backups

**What is backed up.** Two things, both needed for a full restore:

| Part | Where it lives | In the backup as |
| --- | --- | --- |
| Database: users, projects, notes, sessions, tokens | PostgreSQL | `db-<UTC time>.dump` (pg_dump custom format) |
| Search index: vector store and per-project vocabulary | `services/api/data/` on the API's disk | `data-<UTC time>.tar.gz` |

**How.** `scripts/backup_db.sh` dumps the database, checks that the dump can be read back (`pg_restore --list`), archives `data/`, optionally copies both to S3, and deletes local backups older than `BACKUP_KEEP_DAYS` (14). It only ever deletes files it wrote, and exits non-zero on any failure.

**Schedule: nightly.** Example crontab on the API host (03:15 UTC):

```cron
15 3 * * * cd /srv/connecting-dots/services/api && set -a && . ./.env && set +a && BACKUP_DIR=/var/backups/connecting-dots BACKUP_S3_URI=s3://<bucket>/connecting-dots sh scripts/backup_db.sh >> /var/log/cd-backup.log 2>&1
```

- With managed Postgres (Railway, Render, Neon, RDS…), also turn on the provider's own daily backups or point-in-time recovery. This script stays useful as an off-provider copy and for the `data/` folder, which the provider doesn't see.
- For the S3 copy, add a lifecycle rule on the bucket that expires objects after 14 days, and enable server-side encryption.
- Alert on a failed run: the cron job exits non-zero; most schedulers can notify on that.

## Restore

Use this after data loss or a bad migration, or to move to a new host. Tested on 2026-11-17 against the development database: every table count matched.

1. **Stop the API**, so nothing writes while you restore.
2. **Pick the backup pair**: the `db-*.dump` and the `data-*.tar.gz` with the same timestamp.
3. **Restore the database** into an empty database:

   ```sh
   dropdb --if-exists "$POSTGRES_DB"      # only if replacing a broken one
   createdb "$POSTGRES_DB"
   pg_restore --no-owner --no-privileges --exit-on-error -d "$POSTGRES_DB" db-<time>.dump
   ```

   To try a backup without touching the live database, restore into a scratch name (`createdb acw_restore_drill`) instead.
4. **Restore the search index:** replace `services/api/data/` with the archive's contents:

   ```sh
   mv data data.broken && tar -xzf data-<time>.tar.gz
   ```

   If the archive is missing or broken, start with an empty `data/` and run `python scripts/reindex_notes.py`. That rebuilds the index for notes. Full-conversation captures are only searchable again once re-captured, so prefer the archive.
5. **Apply migrations** (a no-op when the backup is from the current version): `alembic upgrade head`.
6. **Start the API** and check it:
   - `GET /api/v1/health/db` returns 200.
   - Sign in on the dashboard; your projects and notes are there.
   - Ask AI answers from a note.

**Restore drill: monthly.** Restore the latest backup into `acw_restore_drill`, compare row counts with the live database, then drop it:

```sh
Q="select 'users',count(*) from users union all select 'projects',count(*) from projects
   union all select 'contexts',count(*) from contexts order by 1"
psql -At -d "$POSTGRES_DB" -c "$Q"; psql -At -d acw_restore_drill -c "$Q"
dropdb acw_restore_drill
```

## Routine jobs

| Job | How it runs | Manual run |
| --- | --- | --- |
| Purge the Trash (items deleted more than `TRASH_RETENTION_DAYS`, 30, ago) | The API, at startup and every `TRASH_PURGE_INTERVAL_HOURS` (6) | `python scripts/purge_trash.py` (set the interval to 0 to run only from cron) |
| Re-index notes after an embedding-model change or a lost `data/` | By hand | `python scripts/reindex_notes.py` (`--dry-run` to count) |
| Demo data on a local stack | By hand | `python scripts/seed.py` (localhost only) |

## Configuration to check on every deploy

- `APP_ENV=production`. This turns on secure cookies and turns off the API docs pages.
- Database: `DATABASE_URL` (Neon's pooled URL) and `DATABASE_URL_UNPOOLED` (direct, used by `alembic upgrade head`), or the `POSTGRES_*` parts. With Neon, the backup script's `pg_dump` needs the direct host, and Neon's own point-in-time restore covers the database itself.
- `JWT_SECRET_KEY`: a long random value, never the development one.
- `ALLOWED_ORIGINS`: the dashboard's origin only. `EXTENSION_ORIGIN=chrome-extension://<id>`.
- The dashboard and the API on the same site (e.g. `app.example.com` and `api.example.com`), or the session cookie isn't sent.
- `RESEND_API_KEY`, and `EMAIL_FROM` on a domain verified in Resend. `DASHBOARD_URL` is the https dashboard, used for the links in emails.
- `AUTH_REGISTER_LIMIT_PER_HOUR` left at 5. Only end-to-end test runs raise it.
- Migrations applied (`alembic upgrade head`) before the new API version starts.
