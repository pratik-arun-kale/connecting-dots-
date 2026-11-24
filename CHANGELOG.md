# Changelog

All notable changes to Connecting Dots. The version is the extension's
(`apps/extension/package.json`), which is copied into its manifest at build.

To release: rename `[Unreleased]` to the new version and date, bump
`apps/extension/package.json` to match, then push a `v<version>` tag. The
release workflow refuses a tag with no matching section here.

## [Unreleased]

### Added
- Production builds: `npm run build:staging` / `build:prod` take the API and
  dashboard URLs from the environment, require https, and request only that
  API origin.
- Release workflow on `v*` tags: production extension zip, API image on
  ghcr.io, GitHub release with these notes.
- CI: extension, dashboard, API and end-to-end jobs; Dependabot.
- `services/api/scripts/seed.py`: a demo user, two projects and twenty notes.
- Pre-commit hook (`.githooks/`): ruff and ESLint on staged files, plus the
  no-localhost check.
- Security: tenant-isolation tests across every route, per-user rate limits,
  CSP and security headers on the dashboard, an explicit extension CSP, and
  end-to-end tests that captured HTML never runs script.
- Dashboard sessions in an httpOnly cookie: no token is stored in
  localStorage any more; existing sessions move over on the next visit.
- Email verification and password reset (Resend): a confirmation link on
  sign-up with a reminder banner, and "Forgot password?" on the sign-in page.
- Saving the same passage or conversation twice into a project gives one
  note and an "Already saved · Open note" message.
- Editing a note in two tabs: a stale save is refused with "Reload theirs /
  Keep mine" instead of silently overwriting the other tab.
- Trash: deleted notes and projects can be restored for 30 days (Undo
  toast, Trash page), then are removed for good.
- `scripts/backup_db.sh` and `docs/runbook.md` (backup, tested restore).
- API: 2 MB request-body limit (413); `npm audit` and `pip-audit` in CI.

### Changed
- Perplexity is no longer supported by the extension (it was partial).
- The API loads its search models at startup and hashes passwords off the
  request loop, so sign-in stays fast while notes are being indexed.
- New accounts need a password of at least 10 characters.
- Captured selections drop `<script>`, `<style>`, `<iframe>` and similar
  elements; selections over 1 MB are saved as plain text.
- One repository: `apps/extension`, `apps/dashboard`, `services/api`,
  `research/advanced-rag`.
- Editing a note re-indexes it; deleting a project removes its vectors.
- The API's default CORS origins no longer include AI sites.

### Fixed
- A new project's sessions were sent to the extension twice.
- The API image no longer copies `.env` or local vector data
  (`services/api/.dockerignore`).
