# Connecting Dots — Production Implementation Plan

Oct 21, 2026 · @Pratik

Twelve weeks of solo work take Connecting Dots from prototype to a public Chrome Web Store launch: phases 0–3 are the launch minimum, 4–6 can overlap with a private beta, and phase 7 is the product roadmap. It implements the production audit in the current `D:\Connecting dots` folder; estimates assume one developer full-time; part-time work roughly doubles them.

## At a glance

&#91;embedded content: roadmap · 8 phases, 3 gates\]

Security (phase 2) is the heaviest phase and the one that must not be skipped; each gate is a go/no-go check before moving on.

## Phase 0 — Repo consolidation (week 1)

Goal: one git repo at `D:\Connecting dots` that holds the extension, dashboard, backend and RAG research, and builds with one command. Everything later depends on this.

**Target layout**

```text
connecting-dots/
  apps/
    extension/        ← chrome_extention_scrapping'/ (renamed)
    dashboard/        ← context-workspace/
  services/
    api/              ← Backend context-workspace/ (moved in)
  research/
    advanced-rag/     ← RAG Pipeline/advanced-rag/ (history kept)
  packages/
    api-types/        ← generated TS client (Phase 6)
    config/           ← shared tsconfig, eslint, prettier
  docs/               ← UI_REDESIGN_PLAN.md, ADRs, runbook
  docker-compose.yml
  pnpm-workspace.yaml
  package.json
  .gitignore  .editorconfig  README.md
```

**Tasks**

- [ ] Find the extension's working copy (another drive, an old zip, the built `dist/` in Chrome) and copy back `package.json`, `manifest.json` / `manifest.dist.json`, `popup.html`, `sidepanel.html`, `vite.config.ts`, `tsconfig.json`, `icons/` and `content-scripts/`. If they are lost, recreate them (task list below).
- [ ] Rename `chrome_extention_scrapping'` to `apps/extension` (removes the typo and the apostrophe that breaks shell quoting).
- [ ] `git init` at the top level; bring in `RAG Pipeline` with `git subtree add --prefix research/advanced-rag <path> main` so its three commits are kept.
- [ ] Move the backend folder into `services/api`; delete its own `.git` only after the top-level commit holds it.
- [ ] Add `pnpm-workspace.yaml` (`apps/*`, `packages/*`) and root scripts: `dev`, `build`, `test`, `lint`, `typecheck`, each running across workspaces.
- [ ] Root `.gitignore`: `node_modules/`, `.next/`, `dist/`, `*.tsbuildinfo`, `.env*` (except `.env.example`), `__pycache__/`, `.venv/`, `chroma_db/`.
- [ ] Add `.env.example` in each app listing every variable with a safe default.
- [ ] Delete `.next/` and `tsconfig.tsbuildinfo` from the working tree; first commit, push to a private remote.

**If the extension build files are lost, recreate them**

1. `package.json` with React, Vite, `@crxjs/vite-plugin` (or the existing `scripts/postbuild.mjs` flow), Turndown, Vitest; versions read from `node_modules/*/package.json`, which is still present.
2. `manifest.json` (MV3): `background.service_worker`, `side_panel`, `action.default_popup`, `permissions` (`storage`, `alarms`, `tabs`, `sidePanel`), `host_permissions` and `content_scripts` for chatgpt.com, claude.ai and gemini.google.com only.
3. `popup.html` and `sidepanel.html` that mount `src/popup` and `src/sidepanel`.
4. Rebuild the per-site extractors (`chatgpt-cs.js`, `claude-cs.js`, `gemini-cs.js`) as TypeScript entries under `src/content/` so they are built, typed and tested with the rest.

**Done when**: a fresh clone runs `pnpm install && pnpm build` and produces the extension `dist/`, the dashboard build and a backend image, and `pnpm test` runs the extension's 12 test files.

## Phase 1 — Build, config and CI (week 2)

Goal: no `localhost` in shipped code, three environments, and every push checked automatically.

**Config in one place**

- [ ] Create `apps/extension/src/config.ts` exporting `API_BASE_URL` and `DASHBOARD_URL` from `import.meta.env.VITE_API_URL` / `VITE_DASHBOARD_URL`; fail the build if either is missing.
- [ ] Replace the hard-coded URLs in the 7 files: `BackendClient.ts`, `authService.ts`, `lib/api.ts`, `searchClient.ts`, `note-cs.ts`, `AskAICard.tsx`, `LoginForm.tsx`. Add an ESLint `no-restricted-syntax` rule that rejects the string `localhost` outside `config.ts`.
- [ ] Add `.env.development`, `.env.staging`, `.env.production` for the extension; `vite build --mode staging` picks one.
- [ ] Generate `host_permissions` for the API origin per mode in `scripts/postbuild.mjs`, so production builds never request `localhost`.
- [ ] Dashboard: read the API URL and extension ID only from `NEXT_PUBLIC_*` vars and validate them at startup with `zod`.
- [ ] Backend: one `pydantic-settings` `Settings` class; CORS origins, DB URL, JWT secret, LLM keys all from env, with no defaults for secrets.

**Local stack**

- [ ] `docker-compose.yml` with `postgres`, `redis` (needed in Phase 6), `api`, `dashboard`; `pnpm dev` starts compose plus the extension in watch mode.
- [ ] Seed script `services/api/scripts/seed.py`: one demo user, two projects, twenty notes.

**Code quality**

- [ ] Shared `packages/config` with `tsconfig.base.json` (`strict: true`), ESLint flat config and Prettier; backend gets `ruff` + `mypy`.
- [ ] `husky` + `lint-staged` pre-commit: format and lint changed files.

**CI pipeline** (GitHub Actions; the same jobs map one-to-one to GitLab CI)

| Job | Runs on | Steps |
| --- | --- | --- |
| `lint-typecheck` | every push | `pnpm lint`, `pnpm typecheck`, `ruff`, `mypy` |
| `test-unit` | every push | Vitest (extension, dashboard), `pytest` (api) with a Postgres service container |
| `build` | every push | extension zip, `next build`, api Docker image |
| `e2e` | pull requests to `main` | Playwright suite from Phase 4 against the compose stack |
| `release` | tag `v*` | upload extension zip as an artifact, push api image, deploy dashboard |

- [ ] Protect `main`: pull request required, all jobs green.
- [ ] Version from one place: `apps/extension/package.json` version written into `manifest.json` at build; `CHANGELOG.md` updated per release.

**Done when**: `grep -r localhost apps/*/src` finds only `config.ts`, and a pull request cannot merge with a failing check.

## Phase 2 — Security and tenant isolation (weeks 3–4)

Goal: one user can never read another's data, captured content cannot run script, and tokens cannot be stolen by page script.

**Tenant isolation (do first)**

- [ ] Audit every query in `services/api`: each SQLAlchemy select on projects, contexts, notes and sessions filters by `owner_id == current_user.id`. Move this into one repository helper (`scoped(select(Model), user)`) so a route cannot forget it.
- [ ] Every ChromaDB `add` stores `user_id` and `project_id` in metadata; every `query` passes `where={"user_id": uid, "project_id": pid}`. Same filter on the BM25 side (index per user, or filter before scoring).
- [ ] Semantic cache keys include `user_id`, so one user's cached answer is never served to another.
- [ ] Return `404`, not `403`, for another user's IDs, so IDs cannot be probed.
- [ ] Add `tests/test_isolation.py`: two users, each with notes; assert user B gets nothing from `/projects`, `/contexts`, `/search/conversations` and `/projects/{id}/query` for user A's data, including RAG citations.

**Captured content (stored XSS)**

- [ ] Extension: sanitise selection HTML with DOMPurify before Turndown in `note-cs.ts`; cap a capture at 1 MB.
- [ ] Backend: reject or strip raw HTML in incoming Markdown (`bleach` or `nh3`), enforce size limits with Pydantic `max_length`.
- [ ] Dashboard: render Markdown with `rehype-sanitize` after Shiki and KaTeX; never `dangerouslySetInnerHTML` on note content. Test with a note containing `<img src=x onerror=alert(1)>`.
- [ ] Strict CSP in `next.config` headers (`default-src 'self'`, API origin in `connect-src`, no `unsafe-eval` in production) and an explicit `content_security_policy` in the manifest.

**Auth and sessions**

- [ ] Dashboard: move access and refresh tokens out of zustand `persist` / `localStorage` into `httpOnly; Secure; SameSite=Lax` cookies set by the API; add CSRF protection (double-submit token) on state-changing routes.
- [ ] Refresh-token rotation with reuse detection: store a token family; a reused refresh token revokes the whole family.
- [ ] Extension keeps `chrome.storage.session` for the access token; restrict `externally_connectable` to the dashboard origin only.
- [ ] Password hashing with Argon2id (check what the backend uses now); minimum length 10, breached-password check optional.
- [ ] Add email verification, password reset, and "log out of all devices".

**Abuse limits**

- [ ] Rate limits with `slowapi` (Redis-backed): login 5/min per IP, capture 60/min per user, RAG query 20/min per user.
- [ ] CORS allowlist: dashboard origin and `chrome-extension://<id>` only.
- [ ] Dependency scanning in CI: `pnpm audit`, `pip-audit`, and GitHub Dependabot or Renovate.

**Done when**: the isolation test and the XSS test pass in CI, and no token is readable from `localStorage` in the dashboard.

## Phase 3 — Data integrity and cleanup (week 5)

Goal: no duplicate notes, no lost edits, nothing deleted by accident, and the known bugs from the audit gone.

**Duplicates and idempotency**

- [ ] Extension: generate the idempotency key from the content, not per click: `sha256(project_id + source_url + normalised_markdown)` in `note-cs.ts` and `CaptureQueue.ts`.
- [ ] Backend: unique index on `(owner_id, project_id, content_hash)`; on conflict return `409` with the existing note's ID and code `DUPLICATE`.
- [ ] Extension: handle `DUPLICATE` and `PROJECT_MISMATCH` (already in `types/messages.ts:76`) with a toast — "Already saved · Open note".
- [ ] Retry queue sends the same key on every retry, so a flaky network never makes two notes.

**Concurrent edits**

- [ ] Add a `version` integer to notes (Alembic migration). Autosave in `note-editor.tsx` sends `If-Match: <version>`; the API returns `409` if it changed, and the editor shows "Edited elsewhere · Reload / Keep mine".
- [ ] Debounce autosave at 800 ms and flush on tab close (`visibilitychange`).

**Safe deletes and backups**

- [ ] Soft delete: `deleted_at` on projects and notes, a Trash view in the dashboard, purge after 30 days by a scheduled job.
- [ ] Deleting a note or project also removes its chunks from ChromaDB and BM25 (the purge job does it, so undo still works).
- [ ] Nightly `pg_dump` to object storage, kept 14 days; write and test the restore steps in `docs/runbook.md`.

**Known bugs from the audit**

- [ ] Remove the second `CREATE_PROVIDER_SESSION` send at `create-project-dialog.tsx:90`; keep the one in `useCreateProjectWithSessions`. Add a guard in the extension so a repeat message never resets stored state to `pending`.
- [ ] Delete the 7 `console.log('[DEBUG] …')` calls in project creation; add an ESLint `no-console` rule (warn/error allowed).
- [ ] Delete unused `store/search-store.ts` and `NAV_ITEMS` in `lib/constants/index.ts`.
- [ ] Perplexity: decide. Either add `perplexity.ai` host permission, content script and adapter, or delete the type, popup row and branch at `background.ts:153`. Recommendation: delete now, add later with a canary (Phase 6).

**Done when**: saving the same selection twice gives one note and a toast, and editing a note in two tabs never silently loses text.

## Phase 4 — Tests and observability (weeks 6–7)

Goal: the core loop is proven by an automated test on every pull request, and a failure in production reaches you before a user reports it.

**Tests by layer**

| Layer | Tool | What to cover first | Target |
| --- | --- | --- | --- |
| Extension unit | Vitest | `SessionOrchestrator` state transitions, `CaptureQueue` retries, each provider adapter against saved HTML fixtures | 70% of `src/core` and `src/providers` |
| Dashboard unit | Vitest + Testing Library | `lib/api/client.ts` refresh flow, notes-feed filters, note editor autosave and conflict | key hooks and components |
| API | pytest + httpx | auth, isolation (Phase 2), duplicates, versioning, RAG endpoint with a stub LLM | every route has a test |
| Contract | schemathesis on the OpenAPI schema | fuzz every endpoint for 500s and schema drift | zero 500s |
| End-to-end | Playwright with the extension loaded (`launchPersistentContext`, `--load-extension`) | log in → select text on a fixture chat page → save → note appears in dashboard → Ask AI cites it | runs on every PR |
| RAG quality | pytest + a golden set | recall@5, MRR, faithfulness on 50 questions over your own notes | no drop >5% per release |

- [ ] Save real ChatGPT, Claude and Gemini page HTML as fixtures under `apps/extension/test/fixtures/`, so adapter tests run offline and show exactly what changed when a site updates.
- [ ] Serve those fixtures from a local page in the Playwright run, so end-to-end tests never log in to real AI sites.
- [ ] Add coverage reports to CI; fail if coverage on `src/core` drops.

**Observability**

- [ ] Sentry in all three parts: `@sentry/browser` in the extension (service worker, popup, side panel, content scripts), `@sentry/nextjs` in the dashboard, `sentry-sdk[fastapi]` in the API. Upload source maps in the `release` job.
- [ ] Request ID: extension and dashboard send `X-Request-ID`; the API logs it with every line (it already has structured logging) and returns it in errors, so one ID traces a failure end to end.
- [ ] Metrics with Prometheus + Grafana (or a hosted equivalent): capture success rate per provider, capture queue depth, API p95 latency per route, RAG query latency and empty-answer rate, LLM tokens per user per day.
- [ ] Alerts: capture success below 90% for any provider over 1 hour, API 5xx above 1%, p95 query latency above 4 s.
- [ ] Uptime check on `/health` (checks DB, Redis and the vector store, not just the process).
- [ ] Never log note content or tokens; add a log filter that redacts `Authorization` and body fields.

**Done when**: the Playwright capture-to-answer test runs green in CI, and a thrown error in each of the three parts appears in Sentry with its request ID.

## Phase 5 — Honest UI, privacy and compliance (week 8)

Goal: no screen shows invented data, users control their data, and the extension passes Chrome Web Store review.

**No fake data**

- [ ] Settings (`(workspace)/settings/page.tsx`): hide the VS Code plugin card; replace the hard-coded extension status with a real ping (`chrome.runtime.sendMessage(EXT_ID, {type:'PING'})`) and the last capture time from the API. Wire or remove the Copy Key button and side tabs.
- [ ] Project cards: return `color`, `session_count` and `context_count` from the API (one `GROUP BY` query) and drop the fixed values in `toFrontendProject`; add a colour picker to project settings.
- [ ] Ask AI: replace `notes × 3` with a real `chunks_indexed` and `last_indexed_at` from `GET /projects/{id}/index-status`.
- [ ] Every list and page gets loading, empty and error states (TanStack Query `isPending` / `isError`) with a retry button.
- [ ] Undo toast on note and project delete (works with soft delete from Phase 3).

**Accessibility and performance**

- [ ] Run axe in the Playwright suite; fix contrast to WCAG AA, label icon buttons, make the Cmd+K palette and sidebar fully keyboard-usable.
- [ ] Lazy-load BlockNote, Shiki and KaTeX with `next/dynamic`; check bundle size with `@next/bundle-analyzer`.
- [ ] Paginate the notes feed (cursor-based, 30 per page) and virtualise it with `@tanstack/react-virtual`.

**Privacy and user control**

- [ ] Privacy policy and terms pages on the dashboard: what is captured, where it is stored, which LLM providers see note text, how to delete it.
- [ ] `GET /me/export` returns a ZIP of every project as Markdown files plus a JSON dump; button in Settings.
- [ ] `DELETE /me` removes the account, notes, chunks, cache entries and backups after the retention window; confirm by typing the email.
- [ ] Encryption at rest on the database and backups (managed Postgres usually covers this); TLS everywhere.
- [ ] India DPDP Act 2023 basics: clear consent at sign-up, a contact for data requests, breach response steps in the runbook. Get a legal review before charging money.

**Chrome Web Store readiness**

- [ ] Request only the hosts used (chatgpt.com, claude.ai, gemini.google.com, the API origin); write a one-line justification for each permission.
- [ ] Store listing: description, 1280×800 screenshots, 128 px icon, privacy-practices form, link to the privacy policy.
- [ ] Publish first as unlisted to 5–10 testers.

**Docs**

- [ ] Top-level `README.md`: what it is, architecture picture, `pnpm install && pnpm dev`, env vars, how to load the unpacked extension.
- [ ] Replace the dashboard's stock `create-next-app` README; add `apps/extension/README.md` and `docs/adr/` for key decisions (monorepo, cookies, vector store).

**Done when**: a tester installs the unlisted extension, captures, exports and deletes their account without any help.

## Phase 6 — Platform upgrades (weeks 9–11)

Goal: fast captures, typed contracts between the three parts, early warning when an AI site changes, and capped LLM cost.

**Typed API contract**

- [ ] Give every FastAPI route a `response_model` and `operation_id`; export the schema with `scripts/export_openapi.py` in CI.
- [ ] Generate `packages/api-types` with `openapi-typescript` + `openapi-fetch`; replace hand-written request types in `BackendClient.ts`, `lib/api.ts` and `lib/api/client.ts`.
- [ ] CI fails if the committed schema and the generated client differ, so a backend change breaks the build, not users.

**Async indexing pipeline**

- [ ] Capture endpoint writes the note and returns `201` at once; it enqueues `index_note(note_id)` on Redis with Arq (async, fits FastAPI) or Celery.
- [ ] Worker in `services/api/worker.py`: chunk → embed → upsert into the vector store and BM25 → set `indexed_at`. Retries with backoff; failures go to a dead-letter list shown in an admin page.
- [ ] Re-index on note edit (debounced 30 s) and remove chunks on delete; store `embedding_model` per chunk so a model change can trigger a background re-embed.
- [ ] Port the prototype's strengths into the API retriever: BM25 + vector with reciprocal rank fusion, cross-encoder rerank, confidence grading. Consider BAAI bge embeddings and Qdrant (payload filters fit tenant isolation) once the eval set exists to prove the gain.
- [ ] Stream answers over SSE from `/projects/{id}/query`; citations carry `note_id` + block ID so the dashboard scrolls to the exact passage.

**Scraper resilience**

- [ ] Move CSS selectors for each provider out of the adapters into a JSON config served by `GET /extension/config` (cached 6 h, signed, with the bundled copy as fallback).
- [ ] Adapter health check: on page load, verify the key selectors match; if not, report `provider_broken` to Sentry and show "Capture may be incomplete on this site" instead of saving an empty note.
- [ ] Daily canary (scheduled CI job) loads a public shared chat on each provider and runs the extractor; alert on failure.

**Cost and quotas**

- [ ] Per-user daily quotas for RAG queries and tokens, stored in Redis; return `429` with reset time and show it in Ask AI.
- [ ] Log model, tokens in/out and latency per query; weekly cost report.

**Product analytics**

- [ ] PostHog with an opt-in banner; events: `capture_saved` (provider, kind), `note_edited`, `search_used`, `ask_ai_asked`, `ask_ai_citation_clicked`.
- [ ] In-app feedback button that posts to a `feedback` table or an email inbox.

**Done when**: a capture returns in under 300 ms with indexing finishing in the background, the extension and dashboard compile against the generated client, and a broken selector raises an alert within a day.

## Phase 7 — Product features after launch (week 12 on)

Goal: build the differentiators in the redesign plan's order, each behind a feature flag and measured with the Phase 6 analytics.

| Order | Feature | Main work | Depends on |
| --- | --- | --- | --- |
| 1 | Content-based duplicate detection | Near-duplicate check with embeddings (cosine > 0.95) on capture; "Similar note exists" prompt | async indexing |
| 2 | AI-generated note titles | Worker job after indexing; small model, 8–12 words; user edit wins | async indexing, quotas |
| 3 | Source favicons on the source chip | Store provider + URL on capture; local icon set per provider | — |
| 4 | Three-pane shell with right context panel (phase 2) | Layout refactor in `(workspace)/layout.tsx`; panel hosts backlinks and related notes | — |
| 5 | Inbox and AI filing (phase 3) | `project_id` nullable; Inbox view; worker suggests a project with confidence; one-click accept | async indexing |
| 6 | Highlight-to-insight, strike-through, version history (phase 4) | BlockNote custom marks; `note_versions` table written on each save | note versioning (Phase 3) |
| 7 | Related-notes panel (phase 5) | Nearest neighbours per note from the vector store, filtered by user | context panel |
| 8 | Book view (phase 6) | `chapters` model, drag notes into chapters, AI synthesis per chapter, export to PDF and EPUB | export (Phase 5) |
| 9 | Import and export | ChatGPT and Claude data-export importers; Notion export | async indexing |
| 10 | MCP server over the vault | Read-only tools `search_notes`, `get_note`, `ask_project` with per-user OAuth tokens, so Claude, ChatGPT and IDE agents can use your context | typed API, quotas |
| 11 | Firefox and Edge builds | `webextension-polyfill`, separate manifests from the same source | CI release job |
| 12 | Sharing and team projects | Read-only public links, then project members and roles | tenant isolation |

Drop the VS Code plugin until there is demand; it is shown in Settings but has no code.

## Risks and open questions

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Extension build files cannot be found | Phase 0 grows by about a week | Recreate them from `node_modules` versions and the source (Phase 0 list) |
| AI sites change markup or block scraping | Captures fail silently | Remote selectors, health checks, daily canary (Phase 6); prefer the selection path, which depends less on site structure |
| Site terms of service on automated capture | Store rejection or takedown | Capture only what the user selects or views, never in the background; legal read of each site's terms before public launch |
| Moving tokens to cookies breaks the extension's auth | Login loops | Keep bearer tokens for the extension, cookies for the dashboard; both supported by the API |
| Solo bandwidth | Plan slips past 12 weeks | Phases 0–3 are the launch minimum; 4–6 can overlap with a private beta |

**Open questions**

- Where is the extension's working copy, and is the backend in its own git repo today?
- Where will it be hosted (Railway, Fly.io, Render, or a VPS), and which managed Postgres?
- GitHub or GitLab for the repo and CI?
- Which LLM providers see note text in production (OpenAI, Anthropic, or local Ollama only)? This decides the privacy policy wording.
- Free beta only, or a paid plan at launch? This decides how much of Phase 6 quotas and billing is needed first.
