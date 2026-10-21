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
   Without Docker: create a Python 3.12 virtualenv in `services/api`, `pip install -r requirements.txt`, point the `POSTGRES_*` variables at your own Postgres, then `alembic upgrade head && uvicorn main:app --reload`.

2. **Dashboard** (http://localhost:3000)
   ```bash
   npm run setup          # npm ci for the extension and the dashboard
   npm run dev:dashboard
   ```

3. **Extension**
   ```bash
   npm run build --prefix apps/extension
   ```
   In `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `apps/extension/dist`. Copy the extension ID into `NEXT_PUBLIC_EXTENSION_ID` in `apps/dashboard/.env.local`, and into `EXTENSION_ORIGIN=chrome-extension://<id>` in `services/api/.env` if you want to restrict CORS to it.

## Configuration

Every URL comes from env files. Shipped code never names `localhost`, and `npm run lint` checks this.

| App | File | Variables |
| --- | --- | --- |
| Extension | `apps/extension/.env.<mode>` | `VITE_API_URL`, `VITE_DASHBOARD_URL` (see `.env.example`) |
| Dashboard | `apps/dashboard/.env.local` | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_EXTENSION_ID` |
| API | `services/api/.env` | `JWT_SECRET_KEY`, `POSTGRES_*`, `ALLOWED_ORIGINS`, `EXTENSION_ORIGIN`, `OPENAI_API_KEY` |

Extension builds: `npm run build` (development, localhost), `npm run build:staging`, `npm run build:prod`. Staging and production need both URLs set and on https; the build writes them into the manifest's `host_permissions` and `externally_connectable`.

## Checks

```bash
npm run check          # lint + localhost guard, typecheck both apps, extension tests
npm run test:e2e       # Playwright, against a running API + dashboard (npm ci --prefix e2e first)
```

API tests: `cd services/api && pytest` (needs Postgres; tests use a `<POSTGRES_DB>_test` database).

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of the above on every push to `master`/`main` and on pull requests.

## Docs

- [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md) — production roadmap (phases 0–7)
- [docs/UI_REDESIGN_PLAN.md](docs/UI_REDESIGN_PLAN.md) — redesign roadmap
- [services/api/README.md](services/api/README.md) — API details
