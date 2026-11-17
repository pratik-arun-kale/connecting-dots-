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

### Changed
- One repository: `apps/extension`, `apps/dashboard`, `services/api`,
  `research/advanced-rag`.
- Editing a note re-indexes it; deleting a project removes its vectors.
- The API's default CORS origins no longer include AI sites.

### Fixed
- A new project's sessions were sent to the extension twice.
- The API image no longer copies `.env` or local vector data
  (`services/api/.dockerignore`).
