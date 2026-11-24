# Connecting Dots — Beta Launch Plan

Nov 21, 2026 · @Pratik

This plan takes Connecting Dots from "works on my machine" to **5–10 invited testers using it for real and sending reviews**. It works through the readiness audit of Nov 21 (blockers B1–B9, follow-ups S1–S12) in the order that unblocks the most, and ends with a feedback loop. The estimates assume one developer working full time.

**Target:** beta invitations go out on **Dec 8, 2026**, about 2½ weeks from now.

## At a glance

| Milestone | What | Days | Gate to pass before moving on |
|---|---|---|---|
| **M0** | Housekeeping | 0.5 | `main` holds the current code; the dev database won't expire |
| **M1** | Small server fixes | 3 | Indexing, sessions and rate limits behave on a serverless host |
| **M2** | Search index moves into Postgres | 4–5 | Search survives an API restart with identical results |
| **M3** | Trust and feedback | 3 (parallel with M2) | Privacy policy, terms, account deletion and a feedback link exist |
| **M4** | Hosting | 1 | Dashboard and API reachable on public URLs, using Neon production |
| **M5** | Extension for testers | 1 + Google review (days) | Unlisted Web Store listing approved, with a fixed extension ID |
| **M6** | Staging check | 1 | Every item on the launch checklist passes on the real URLs |
| **M7** | Beta and feedback loop | ongoing | Testers invited, feedback reviewed weekly |

**Critical path:** M0 → M1 → M2 → M4 → M6 → M7. **M3** runs alongside M2. Send **M5** to Google as soon as M3's privacy policy page is live, because the review wait can't be shortened.

## Decisions needed from you (before M4)

| Decision | Options | Recommendation |
|---|---|---|
| Domain name | Any (~$10/year, e.g. Cloudflare Registrar) | Buy one. Email to testers needs it (B7), and it allows `app.` / `api.` addresses later. |
| Cloud Run region | `australia-southeast1` (next to Neon) or `asia-south1` (nearer India) | Next to the database: Neon is in Sydney, and every request queries it several times |
| Email verification | Required, or banner only (today) | Banner only for an invite-only beta; require it before a public launch |
| Feedback tool | Tally, Google Forms | Tally (free, accepts URL-prefilled fields) |
| Number of testers | 5–10, or 20 | Start with 5–10; it keeps everything in the free tiers |
| Privacy policy text | I draft it, you review it | You own it legally; a lawyer review is worth it before a public launch |

---

## M0 — Housekeeping (day 1, ½ day)

### M0.1 Keep the Neon dev branch alive  ·  Low  ·  ✅ Done Nov 22
*Expiry removed with `neon branches set-expiration dev` (it was 2026-11-27T05:47Z); `neon.ts` now exempts `dev` from the 7-day rule, and `neon config plan` reports no changes.*
- **Why:** [neon.ts](../neon.ts) gives every new branch a 7-day lifetime (`ttl: "7d"`), so `dev` will be deleted on Nov 27.
- **Steps:** remove the `ttl` rule from `neon.ts`, or set the dev branch's expiry to "never" in the Neon console.
- **Done when:** the Neon console shows no expiry date on `dev`.

### M0.2 Bring `main` up to date  ·  Low
- **Why:** `main` holds only the initial commit. Releases (`release.yml`) run from tags, and branch protection needs a real `main`. This is PRODUCTION_PLAN Phase 1's last open item.
- **Steps:** open a pull request from `week5/data-integrity` (it already contains the earlier week branches) into `main`, merge it once CI is green, and protect `main` (pull request required, all jobs green).
- **Done when:** `main` matches the branch and a pull request can't merge with a failing check.

---

## M1 — Small server fixes (days 1–3)

All of these are code changes that come with tests. None need new infrastructure.

### M1.0 Dashboard dependency vulnerabilities  ·  Low  ·  ✅ Done Nov 24
*`npm audit` reported 2 critical and 17 high advisories in the dashboard's production packages. The worst were in `next` 16.2.6: remote code execution via image optimization, SSRF in rewrites, and cache poisoning. Fixed by upgrading `next` and `eslint-config-next` to 16.4.6 and running `npm audit fix` (no major versions). Production packages now have 0 high and 0 critical advisories, and the CI audit job is a real check. What's left: 8 moderate/low advisories whose only npm fix is a major downgrade (`shadcn`, `rehype-katex`), plus 1 high in an ESLint-only package.*

### M1.1 Indexing runs inside the request (B3)  ·  Medium  ·  ✅ Done Nov 24
*Done as designed below (migration 0014 adds `contexts.indexed_version`). Two additions:*
- *Annotation-only edits keep the index marked current, so they cost no re-index.*
- *Password reset now sends its email before answering, then pads every answer to 1.5 s, so the response time still doesn't reveal which addresses have accounts.*

*Verified with 405 tests, a migration round-trip on Neon dev plus a backfill check on a scratch database, and a real-model run: a capture is searchable at once, an edit is found by its new text, a trashed note disappears, and a restored one comes back.*
- **Why:** captures and edits are indexed in FastAPI `BackgroundTasks`, after the response has been sent. Cloud Run throttles CPU at that point, so a capture may never become searchable.
- **Design:**
  - **New capture** (`POST /projects/{id}/capture`, [projects.py](../services/api/app/api/v1/routes/projects.py)): await `rag_service.index_context(...)` before returning. An indexing error is logged, and the note stays saved.
  - **Edits** (`PATCH /contexts/detail/{id}`) arrive every ~800 ms while typing, so they don't index inline. Instead, add `contexts.indexed_version` (migration 0014). `contexts.version` already goes up on every edit, so a note is out of date when `indexed_version != version`.
  - **Before a search or Ask AI question** runs on a project, re-index that project's out-of-date notes first (usually zero or one note). This replaces the 5-second background wait in `RagService.reindex_context`.
  - **Restore from trash** ([trash.py](../services/api/app/api/v1/routes/trash.py)): re-index inline.
  - **Emails** (`auth.py`): await `email_sender.send(...)` instead of `background.add_task`. A Resend call takes about 200 ms.
- **Tests:** after a capture returns, its chunks exist. An edited note is found by its new text on the next search. An edit followed by an immediate search returns the new text. The existing reindex tests are updated.
- **Done when:** no `background_tasks.add_task` remains in the routes, and all tests pass.

### M1.2 Real client IP for rate limits (B5)  ·  Low  ·  ✅ Done Nov 24
*Done as designed below, with these specifics:*
- *Uvicorn now runs with `--no-proxy-headers`. Only dropping `"*"` wasn't enough, because uvicorn still trusts `X-Forwarded-For` from 127.0.0.1 by default.*
- *New settings: `TRUSTED_PROXY_HOPS` (default 0) and `PROXY_SHARED_SECRET` (at least 32 characters). The proxy sends the secret in `X-Proxy-Secret` and the browser's address in `X-Client-IP`. An address that isn't a valid IP is ignored, and the next rule applies.*
- *Note for M1.3: Next.js `rewrites()` can't add request headers, so the dashboard's proxy has to be `proxy.ts` (middleware) or a route handler that sets those two headers and overwrites any the browser sent.*

*Verified with 427 tests, 22 of them new. The image workflow also runs the built container and sends 31 refreshes, each with a different `X-Forwarded-For`; the 31st must get a 429. Run against the old flags, the same check gets 31 × 401, so it catches a regression.*
- **Why:** `--forwarded-allow-ips *` makes uvicorn trust the leftmost `X-Forwarded-For` entry, which the caller controls, so rate limits can be bypassed. Behind the Vercel proxy (M1.3), every dashboard user would also share Vercel's IP, letting only 5 accounts register per hour in total.
- **Design:**
  - Remove `--forwarded-allow-ips "*"` from the [Dockerfile](../services/api/Dockerfile) `CMD`.
  - In [rate_limit.py](../services/api/app/core/rate_limit.py), `_client_ip()` reads `X-Forwarded-For` and takes the entry `TRUSTED_PROXY_HOPS` places from the right. This is a new setting: 0 locally; on Cloud Run it's set in M6 after looking at real headers.
  - For dashboard traffic through Vercel, prefer the IP Vercel itself reports, but only when the request provably came through Vercel. The plan for that: a shared secret header that Vercel's rewrite adds and the API checks.
- **Tests:** a spoofed `X-Forwarded-For` doesn't change the rate-limit bucket. Two different clients behind the proxy get different buckets.
- **Done when:** the tests pass. M6 confirms the hop count on Cloud Run.

### M1.3 Dashboard forwards `/api/*` to the API (B4)  ·  Low  ·  ✅ Done Nov 24
*Done with [src/proxy.ts](../apps/dashboard/src/proxy.ts) (Next 16's "proxy", formerly middleware) instead of `rewrites()`, because the request needs the M1.2 headers. Specifics:*
- *`NEXT_PUBLIC_API_BASE_URL` may now be the path `/api/v1`. Use that on Vercel, so preview deployments with their own hostnames work too.*
- *On Vercel only, the proxy reports `x-real-ip` as `X-Client-IP`, together with `PROXY_SHARED_SECRET`. Vercel sets that header itself. Anywhere else no address is reported, because a header there could be made up.*
- *A local run against an echo server confirmed what reaches the upstream: path, query, body, `Origin` and cookies, with `Host` rewritten to the upstream's. The browser's own `X-Proxy-Secret` and `X-Client-IP` were replaced. `Set-Cookie` came back.*
- *CI's end-to-end job now runs in proxy mode. A new test checks that the browser contacts no origin except the dashboard, and that the session survives a reload.*
- *Still to check on Vercel (M6): the timeout for proxied requests covers Ask AI.*
- **Why:** `*.vercel.app` and `*.run.app` are different sites, so the `SameSite=Strict` refresh cookie is never sent, and users are logged out on every reload.
- **Design:**
  - In [next.config.ts](../apps/dashboard/next.config.ts), add `rewrites()` with `/api/:path*` → `${API_UPSTREAM_URL}/api/:path*`. `API_UPSTREAM_URL` is a new server-only variable, the Cloud Run URL.
  - Set `NEXT_PUBLIC_API_BASE_URL=https://<dashboard>/api/v1`. The browser then only talks to the dashboard's own origin, and CSP `connect-src 'self'` already allows that.
  - The cookie path (`/api/v1/auth`) and the host-only cookie work unchanged.
  - The extension keeps calling Cloud Run directly with bearer tokens.
- **Check on Vercel:** `Set-Cookie` and `Origin` pass through the rewrite, and the proxy timeout covers Ask AI (up to about 30 s for OpenAI plus retrieval).
- **Tests:** in CI, run the end-to-end suite once through the rewrite, with the dashboard on :3000 forwarding to the API on :8000.
- **Done when:** the end-to-end tests pass in rewrite mode, and a reload keeps you signed in.

### M1.4 No surprise "logged out everywhere" (S1)  ·  Medium
- **Why:** if two tabs (or the extension's popup and background worker) refresh with the same token, the second request looks like token theft and revokes every session. The second tab's 401 is confirmed by an audit probe; the revoke-all comes from reading the code.
- **Server ([services/auth.py](../services/api/app/services/auth.py) `refresh`):**
  - Add `auth_sessions.rotated_at` (migration 0014). It's set when a token is rotated, as distinct from a logout.
  - Reuse within **30 s** of `rotated_at` issues a new pair without revoking anything.
  - Reuse after the window, or of a logged-out token, revokes everything as today.
- **Dashboard ([client.ts](../apps/dashboard/src/lib/api/client.ts)):** wrap refresh in `navigator.locks.request('cd-refresh', …)` so tabs take turns.
- **Extension:** popup and side panel ask the background worker to refresh (one `chrome.runtime` message), instead of refreshing themselves.
- **Tests:**
  - A second refresh within the grace window gets a working pair, and the first tab's session stays valid.
  - Reuse after 30 s still revokes everything.
  - Reuse after logout still fails.
- **Done when:** the tests pass, and opening 5 dashboard tabs at once keeps you signed in.

### M1.5 Survive cold starts (S2)  ·  Low
- **Why:** the dashboard's axios timeout is 10 s, and so is the extension's search timeout, while a Cloud Run cold start can take longer.
- **Steps:**
  - [client.ts](../apps/dashboard/src/lib/api/client.ts): retry a GET once after a timeout or network error, and allow 45 s on that retry.
  - Show "Waking up the server…" after 3 s.
  - Do the same in the extension's [searchClient.ts](../apps/extension/src/search/api/searchClient.ts).
- **Done when:** with the API stopped and started again, the first dashboard load succeeds without an error.

### M1.6 Quick fixes  ·  Low (all together, about ½ day)
- **S4:** hide the mock [Settings page](../apps/dashboard/src/app/(workspace)/settings/page.tsx) (redirect it to `/notes`). M3.3 replaces it.
- **S8:** stop logging `original_query`, `normalized_query` and conversation titles in `pipeline.py` (`conversation_search_final_trace`). Log counts and lengths instead.
- **S11:** rename the extension in [manifest.dist.json](../apps/extension/manifest.dist.json) from "Context Workspace" to "Connecting Dots", and check the popup and side panel text.
- **S7:** slim down the notes list (`GET /contexts`).
  - Check which fields the sidebar, notes feed and Ask AI page read from `useNotes`.
  - Add a `NoteSummary` schema with those fields plus a short server-made preview (about 200 characters).
  - Query only those columns.
  - The note page keeps using `GET /contexts/detail/{id}` for the full text.
- **Cleanup from the codebase audit:**
  - drop `redis` and `hiredis` from `requirements.txt` (nothing imports them); remove `app/utils/redis.py` and the `close_redis()` call
  - drop `python-multipart`
  - delete the 7 unused dashboard components
  - delete the unreachable extraction code in `content-scripts/*-cs.js`, keeping their ready/login detection
  - remove `@neon/env` and `app/workers/`
  - remove the stale "Perplexity" text in `run_query`, and the `[DEBUG]` origin field in the logging middleware
- **Done when:** tests pass, and the image builds smaller with `redis`/`hiredis` gone.

**M1 gate:** all API tests and end-to-end tests pass in CI, including the new ones. The image builds and passes its offline model check.

---

## M2 — Search index moves into Postgres (days 4–8)

**Why (B2):** ChromaDB and the vocabulary JSON files live in `services/api/data/`. Cloud Run's disk is temporary and stored in memory, so every restart wipes search and Ask AI. With two instances, each would hold a different partial index. Moving the index into Neon fixes all of this, and backups then cover it too.

**Ranking stays identical.** The same embeddings, the same `rank_bm25`, the same fusion, reranking and grading run. Only where chunks are stored changes. Moving keyword search into SQL is a separate, later step (M2.7).

### M2.1 Schema (migration 0015)  ·  Medium
```sql
CREATE EXTENSION IF NOT EXISTS vector;              -- 0.8.7 available on the Neon project

CREATE TABLE context_chunks (
  id          text PRIMARY KEY,                     -- today's positional id: <context>__m<i>__c<j>
  context_id  uuid NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text        text NOT NULL,
  metadata    jsonb NOT NULL,                       -- what Chroma stores today (title, platform, chat_url, …)
  embedding   vector(384) NOT NULL
);
CREATE INDEX ix_context_chunks_project ON context_chunks (project_id);
CREATE INDEX ix_context_chunks_context ON context_chunks (context_id);
CREATE INDEX ix_context_chunks_embedding ON context_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE project_vocabulary (
  project_id  uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  entries     jsonb NOT NULL                        -- the dict vocabulary.py writes to JSON today
);
```
- **Note:** `ON DELETE CASCADE` means deleting an account (M3.2) or a project removes its chunks automatically.
- **Add** `pgvector` (the Python package) to `requirements.txt`.

### M2.2 Replace the storage behind the existing functions  ·  Medium
- [vector_store.py](../services/api/app/core/rag/vector_store.py) keeps **the same functions and return shapes**, now running SQL through a small synchronous engine on the pooled URL. They're called from worker threads, as today:
  - `upsert_chunks`: `INSERT … ON CONFLICT (id) DO UPDATE`
  - `retrieve`: `ORDER BY embedding <=> :q LIMIT :k`, with the score `1/(1+distance)` exactly as now
  - `get_all_chunks`, `chunk_count`
  - `delete_context_chunks`, `delete_project_collection`
- [vocabulary.py](../services/api/app/core/rag/vocabulary.py) `_load_vocab` / `_save_vocab` / `delete_vocabulary` read and write `project_vocabulary` instead of files.
- `pipeline.py`, `rag_service.py`, `suggestions.py` and `trash.py` don't change; they only call those functions.

### M2.3 Fill the new tables  ·  Low
- Run [reindex_notes.py](../services/api/scripts/reindex_notes.py) against each database (dev now, production in M4). It already rebuilds everything from `contexts`.

### M2.4 Prove nothing changed  ·  Medium
- **Before switching:** seed a project with about 30 varied notes (`seed.py`), then record the top 5 results and their scores for 20 fixed searches and 10 Ask AI questions.
- **After switching:** the same IDs come back in the same order, with scores equal within 1e-5.
- Update `tests/core/rag/test_vector_store.py` to run against the test Postgres.
- Run the real-model end-to-end check (indexing, semantic search, BM25, hybrid search, Ask AI with OpenAI stubbed) in CI, not only locally.

### M2.5 Restart test  ·  Low
- **Done when:** capture a note, restart the API (a container restart in CI), search, and the note is found. Add this to the image workflow.

### M2.6 Remove ChromaDB  ·  Low
- After M2.4 passes, drop `chromadb` (and with it `onnxruntime`, `kubernetes`, `opentelemetry-*` and others) from `requirements.txt`. Confirm with a fresh resolve that nothing else imports them.
- Remove `data/` from the image's assumptions.
- **Done when:** the image is smaller and uses less memory (measured in the workflow).

### M2.7 Later, not for the beta: keyword search in SQL
- Today every search loads all of a project's chunks to build BM25 in Python. That's fine for testers.
- Before about 100 users: replace it with Postgres full-text search, or with `pg_search` (true BM25, available on Neon), so searches stop pulling every chunk across the network. That ends up costing against Neon's 5 GB/month transfer limit.

**M2 gate:** search results are identical before and after (M2.4), the restart test passes (M2.5), and all tests are green.

---

## M3 — Trust and feedback (days 4–8, alongside M2)

### M3.1 Privacy policy and terms pages (B8)  ·  Low–Medium
- **New pages:** `apps/dashboard/src/app/privacy/page.tsx` and `apps/dashboard/src/app/terms/page.tsx`. They're static and need no login.
- **Linked from:** the login and register pages, the sidebar footer, and the extension popup.
- **The privacy policy must state:**
  - **Collected:** email and password hash; captured conversations, passages and notes; search queries (processed, not stored).
  - **Where it goes:** Neon (database), Google Cloud Run (API), Vercel (dashboard), Resend (email), and OpenAI. **Ask AI sends excerpts of the user's notes to OpenAI.**
  - **Retention and deletion:** trash is purged after 30 days, and account deletion (M3.2) removes everything.
  - **Contact address.**
  - The Chrome Web Store "Limited Use" statement.
- **Done when:** both pages are live and linked. You review the text.

### M3.2 Delete my account (B8)  ·  Medium  ·  *after M2, so chunks are removed by the cascade*
- **API:** `DELETE /api/v1/auth/account` with `{password}`. It checks the password, deletes the user (everything cascades: projects → sessions → contexts → chunks, plus `auth_sessions` and `email_tokens`), clears the cookie, and returns 204.
- **Dashboard:** a "Delete account" button with a confirmation dialog on the new Settings page (M3.3).
- **Tests:** after deletion, nothing belonging to that user remains in any table; another user's data is untouched; a wrong password returns 401.

### M3.3 A real Settings page (replaces S4's redirect)  ·  Low
- Account email and verification status, plus a resend-verification button.
- "Log out of all devices" (S5). `authService.logoutAll` already exists.
- Delete account (M3.2).
- Links to the privacy policy and terms.

### M3.4 Feedback link (B9)  ·  Low
- **Form:** create a Tally form asking:
  1. How easy was it to set up? (1–5)
  2. What did you try to do?
  3. What broke or confused you?
  4. Would you keep using it, and why?
  5. Anything you'd pay for?
- **Hidden fields:** app version and where the form was opened from.
- **"Send feedback" links:** in the dashboard sidebar, the extension popup footer, and after an Ask AI answer (👍/👎 opens the form prefilled).
- **Done when:** a test submission arrives with the version filled in.

### M3.5 Error visibility (S6)  ·  Low
- **Without a new service:** a log-based alert in Google Cloud. Email yourself when the API logs `level=error` more than 5 times in 10 minutes. Errors are already structured JSON. Vercel's runtime logs cover the dashboard.
- **Later, if that's not enough:** Sentry's free plan, with a filter that strips note content and tokens before sending.

**M3 gate:** privacy and terms are live; account deletion is tested; feedback submissions arrive; the error alert fires on a test error.

---

## M4 — Hosting (day 9, about 1 day)

### M4.1 Accounts and budget  ·  Low
- **Google Cloud:**
  - Create a project and link billing (a card is required).
  - **Create a budget alert at $5/month** before anything else.
  - Enable Cloud Run, Artifact Registry and Secret Manager.
- **Vercel:** Hobby account, linked to GitHub.
- **Domain (decision above):** buy it, then verify it in Resend (DNS records for SPF and DKIM).

### M4.2 Production database  ·  Low
1. Run `neon checkout production`, which writes production's URLs to `.env.local`.
2. Run `alembic upgrade head` (it uses the direct URL), then `reindex_notes.py` (the database is empty, so this just checks the setup).
3. Switch back with `neon checkout dev`.
- In the Neon console, set the restore window to the free plan's maximum.

### M4.3 API on Cloud Run  ·  Medium
- **Image:** create an Artifact Registry *remote repository* pointing at `ghcr.io`, so Cloud Run can pull `ghcr.io/pratik-arun-kale/connecting-dots-api:<sha>` through it.
- **Service:** region (decision above), **2 GiB memory, 1 vCPU, min instances 0, max instances 1** (the in-memory rate limits need a single instance), container port **8000**, request timeout 120 s.
- **Billing setting:** request-based (the default). This only works once M1.1 is in.
- **Environment:**
  - `APP_ENV=production`
  - `ALLOWED_ORIGINS=https://<dashboard>`
  - `EXTENSION_ORIGIN=chrome-extension://<id from M5>`
  - `DASHBOARD_URL=https://<dashboard>`
  - `EMAIL_FROM=Connecting Dots <hello@<domain>>`
  - `TRUSTED_PROXY_HOPS` (from M6)
- **Secrets** (Secret Manager): `JWT_SECRET_KEY` (64 random bytes), `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `RESEND_API_KEY`, `OPENAI_API_KEY`.
- **OpenAI:** set a monthly spending limit of $10 in the OpenAI dashboard.
- **Done when:** `GET https://<run-url>/api/v1/health` returns 200 and `/health/db` returns 200.

### M4.4 Dashboard on Vercel  ·  Low
- **Project:** root directory `apps/dashboard`.
- **Environment:** `API_UPSTREAM_URL=https://<run-url>`, `NEXT_PUBLIC_API_BASE_URL=https://<dashboard>/api/v1`, `NEXT_PUBLIC_EXTENSION_ID=<id from M5>`.
- **Done when:** you can register, receive the verification email, log in, reload, and stay signed in.

### M4.5 Deploys from `main`  ·  Medium
- Extend `release.yml`:
  - after the image is pushed, run migrations against production (a Cloud Run job, or a step using the direct URL), then deploy that exact `sha` to Cloud Run;
  - Vercel deploys `main` by itself.
- Set the repo variables `PROD_API_URL` and `PROD_DASHBOARD_URL`.
- **Done when:** tagging `v3.1.0` releases the extension zip, migrates, and updates both the API and the dashboard.

---

## M5 — Extension for testers (day 9, then Google's review)

### M5.1 Unlisted Chrome Web Store listing (B6)  ·  Low + waiting
- **Why:** every unpacked install gets a different extension ID, so the dashboard (one `NEXT_PUBLIC_EXTENSION_ID`) can't open AI sessions in a tester's extension. A Web Store listing has one fixed ID.
- **Steps:**
  1. Developer account ($5 one-time).
  2. Upload the production zip from `release.yml`.
  3. Visibility: **Unlisted**, so only people with the link can install it.
  4. Fill in the single-purpose description, a justification for each permission (`tabs`, `scripting`, `webNavigation`, `sidePanel`, `storage`, `alarms`, plus the ChatGPT, Claude and Gemini hosts), the data-use disclosures, and the privacy policy URL from M3.1.
- **Development builds:** add a `key` to [manifest.dist.json](../apps/extension/manifest.dist.json) so unpacked builds share one fixed ID too.
- **Done when:** the listing is approved, and its ID is in `EXTENSION_ORIGIN` (Cloud Run) and `NEXT_PUBLIC_EXTENSION_ID` (Vercel).

---

## M6 — Staging check (day 10–11)

### M6.1 Set the proxy hop count  ·  Low
- Log the `X-Forwarded-For` chain once each for a dashboard request (through Vercel) and an extension request (direct). Set `TRUSTED_PROXY_HOPS` from that, remove the temporary log, and confirm that a spoofed header doesn't change the rate-limit bucket.

### M6.2 Launch checklist (on the real URLs, two fresh accounts)
- [ ] Register, verification email arrives, verify, log out, log in, reset password.
- [ ] Reload and close/reopen the browser: still signed in. Open 5 tabs at once: still signed in (M1.4).
- [ ] Install the extension from the unlisted link and sign in.
- [ ] **Capture on ChatGPT, Claude and Gemini, a short and a long chat each (S3).** Each one appears in the dashboard with the right title and messages.
- [ ] Save a selected passage from each site.
- [ ] Search finds each capture immediately. After a Cloud Run redeploy it still does (M2).
- [ ] Ask AI answers with citations, and the 👍/👎 feedback link works.
- [ ] Edit a note, then search for the new text right away (M1.1).
- [ ] Trash: undo, restore, and delete for good.
- [ ] Account B can't see anything of account A's (try account A's note URL while signed in as B).
- [ ] Delete account B; it can't log in, and its data is gone.
- [ ] Leave it idle for 30+ minutes, then load the dashboard: it works, with at most a "waking up" message (M1.5).
- [ ] The error alert fires on a forced error. Cloud Run, Neon and OpenAI usage show in their consoles.

### M6.3 Backups (S9)  ·  Low
- Make `backup_db.sh` read `DATABASE_URL_UNPOOLED` (with `sslmode=require`).
- Run it weekly from your own machine and store the encrypted dump off the machine.
- **Never as a GitHub Actions artifact:** the repo is public, so its artifacts can be downloaded by others.
- Do one restore drill into a scratch Neon branch.

**M6 gate:** every checkbox passes. A failure goes back to the milestone that owns it.

---

## M7 — Beta and feedback loop (from Dec 8)

- **Invite** 5–10 testers by email with:
  - the dashboard link and the unlisted extension link
  - a 1-page guide: install → sign up → create a project → capture one chat each on ChatGPT, Claude and Gemini → search for it → ask a question
  - the feedback form link
- **Week 1:** check errors and usage every day; fix anything blocking within 24 h.
- **Week 2:** a 15-minute call with 2–3 testers. Ask what they used it for, what was confusing, and what would make them come back.
- **Weekly review:** read the feedback form, error alerts and costs (Cloud Run, Neon, OpenAI). Keep a list of the top 5 issues and fix them in priority order.
- **Exit criteria for a wider beta:**
  - 70%+ of testers capture from at least 2 sites
  - no data-loss reports
  - error rate under 1%
  - costs within the free tiers plus OpenAI

## Deferred until the beta proves the product
- Keyword search in SQL (M2.7). Redis-backed rate limits and more than one API instance.
- Requiring email verification. Data export (a JSON download of all notes).
- Saved-page fixtures so capture is tested automatically (S3, PRODUCTION_PLAN Phase 4).
- Trying `fastembed` (ONNX) to drop PyTorch. Vercel Pro and a paid Neon plan once free limits are reached.

## Cost during the beta
About **$1–2 per month** of OpenAI usage, plus a **~$10/year** domain and a one-time **$5** Web Store fee. Neon, Cloud Run (within the free quota), Vercel Hobby, Resend and GitHub cost nothing at this scale. The $5 Google budget alert and the $10 OpenAI limit protect against surprises.
