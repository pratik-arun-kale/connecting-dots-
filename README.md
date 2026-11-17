# Connecting Dots

Capture conversations and highlighted passages from ChatGPT, Claude and Gemini into projects, then search and ask questions over them.

| Part | Folder | Stack |
| --- | --- | --- |
| Chrome extension | [apps/extension](apps/extension) | MV3, React 18, Vite + esbuild, Vitest |
| Web dashboard | [apps/dashboard](apps/dashboard) | Next.js 16, React 19, Tailwind 4, TanStack Query |
| API | [services/api](services/api) | FastAPI, SQLAlchemy (async), PostgreSQL, Alembic, ChromaDB |
| RAG research prototype | [research/advanced-rag](research/advanced-rag) | Python, Streamlit (standalone, not used by the API) |
| End-to-end tests | [e2e](e2e) | Playwright |

## Run it locally

Needs Node 20+, Docker, and Chrome.

1. **API and database**
   ```bash
   cp services/api/.env.example services/api/.env   # then set JWT_SECRET_KEY
   docker compose up -d                              # Postgres + API on :8000, migrated on start
   ```
   Demo data (optional, API running): `cd services/api && python scripts/seed.py` creates `demo@example.com` / `demo-password-123` with two projects and twenty notes. Safe to run again.

   Without Docker: create a Python 3.12 virtualenv in `services/api`, `pip install -r requirements.txt`, point the `POSTGRES_*` variables at your own Postgres, then `alembic upgrade head && uvicorn main:app --reload`.

2. **Dashboard** (http://localhost:3000)
   ```bash
   npm run setup          # npm ci for both apps, and turns on the pre-commit hook
   npm run dev:dashboard
   ```

3. **Extension**
   ```bash
   npm run build --prefix apps/extension
   ```
   In `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `apps/extension/dist`. Copy the extension ID into `NEXT_PUBLIC_EXTENSION_ID` in `apps/dashboard/.env.local`, and into `EXTENSION_ORIGIN=chrome-extension://<id>` in `services/api/.env` if you want to restrict CORS to it.

## Configuration

Every URL comes from env files. Shipped code never names `localhost`, and `npm run lint` checks this.

**Host the dashboard and the API on the same site** (for example `app.example.com` and `api.example.com`). The dashboard's refresh token is an httpOnly `SameSite=Strict` cookie set by the API, which browsers only send between same-site origins. The extension doesn't use the cookie.

| App | File | Variables |
| --- | --- | --- |
| Extension | `apps/extension/.env.<mode>` | `VITE_API_URL`, `VITE_DASHBOARD_URL` (see `.env.example`) |
| Dashboard | `apps/dashboard/.env.local` | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_EXTENSION_ID` |
| API | `services/api/.env` | `JWT_SECRET_KEY`, `POSTGRES_*`, `ALLOWED_ORIGINS`, `EXTENSION_ORIGIN`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `DASHBOARD_URL` |

Email: with `RESEND_API_KEY` unset, development writes each verification and reset email (with its link) to the API log instead of sending it. `EMAIL_FROM` needs a domain verified in Resend to reach anyone but your own Resend address.

Extension builds: `npm run build` (development, localhost), `npm run build:staging`, `npm run build:prod`. Staging and production need both URLs set and on https; the build writes them into the manifest's `host_permissions` and `externally_connectable`.

## Checks

```bash
npm run check          # lint + localhost guard, typecheck both apps, extension tests
npm run test:e2e       # Playwright: needs a running API (with AUTH_REGISTER_LIMIT_PER_HOUR=100) + dashboard and a built extension (npm ci --prefix e2e first)
```

API: `cd services/api && ruff check app main.py tests scripts && pytest` (pytest needs Postgres; tests use a `<POSTGRES_DB>_test` database). `mypy` runs in CI as a report only for now.

The pre-commit hook ([.githooks/pre-commit](.githooks/pre-commit), enabled by `npm run setup` or `npm run hooks`) runs ruff and ESLint on staged files and the localhost guard.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of the above on every push to `master`/`main` and on pull requests.

## Releasing

Move the `[Unreleased]` notes in [CHANGELOG.md](CHANGELOG.md) under the new version, set the same version in `apps/extension/package.json`, then `git tag v<version> && git push origin v<version>`. [release.yml](.github/workflows/release.yml) builds the production extension zip, pushes the API image to `ghcr.io/<owner>/connecting-dots-api`, and creates a GitHub release. It needs the repository variables `PROD_API_URL` and `PROD_DASHBOARD_URL`.

## Docs

- [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md) — production roadmap (phases 0–7)
- [docs/UI_REDESIGN_PLAN.md](docs/UI_REDESIGN_PLAN.md) — redesign roadmap
- [services/api/README.md](services/api/README.md) — API details
