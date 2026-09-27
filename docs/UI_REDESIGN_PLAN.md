# UI Redesign Plan — Connecting Dots

Research-only deliverable. Nothing in this document has been implemented. Every claim below was verified against the actual code as of 2026-09-27; anywhere the code didn't answer a question, that's stated explicitly instead of guessed.

---

## 1. Current State Map

### 1.1 Frontend (`context-workspace/`, Next.js 16 App Router, Tailwind v4, shadcn `base-nova`, TanStack Query, zustand)

**Routes** (`src/app/`):
- `login/page.tsx`, `register/page.tsx` — standalone, no shell.
- `(workspace)/layout.tsx` — gates on `useAuthStore`, redirects to `/login` if unauthenticated, otherwise renders `<AppShell>`.
- `(workspace)/dashboard/page.tsx` — project grid/stats.
- `(workspace)/projects/page.tsx` — searchable project list (near-duplicate of dashboard's content).
- `(workspace)/projects/[id]/page.tsx` — **project detail page**, three tabs (shadcn `Tabs`, deep-linkable via `?tab=`):
  1. **Notes** (default) → `NotesFeed` (`src/components/project/notes-feed.tsx`).
  2. **Sessions** → `SessionTimeline`, with `source_platform === 'note'` rows filtered OUT (notes are structurally sessions on the backend but deliberately hidden from this tab).
  3. **Ask AI** → `ConversationSearchPanel` stacked above `RagQueryPanel`.
- `(workspace)/sessions/page.tsx`, `sessions/[id]/page.tsx` — global sessions list and detail (chat stream + metadata sidebar).
- `(workspace)/contexts/page.tsx` — "Saved Contexts" list with its own type filter.
- `(workspace)/settings/page.tsx`.

**No Inbox route or concept exists anywhere today.**

**Layout chrome** (`src/components/layout/`):
- `app-shell.tsx` — `flex h-screen w-screen`, `Sidebar` + (`TopNav` + `<main className="max-w-7xl mx-auto">`). Mounts `SearchDialog` globally.
- `sidebar.tsx` — persistent app-wide left nav (Dashboard, Projects, Sessions, Saved Contexts, Settings), collapsible (64px↔220px, zustand-persisted), **separate from the Notes tab's own internal sidebar**. Mobile uses a second, independently-maintained nav-item list inside a `Sheet`.
- `top-nav.tsx` — fake search box (opens Cmd+K palette), sync-status indicator (cosmetic only, not real), theme toggle, notification bell (non-functional placeholder), user menu.
- No breadcrumbs component; each detail page hand-rolls its own "Back to X" link.

**Command palette**: real and wired up (`src/features/search/search-dialog.tsx`, `cmdk`-based). Opens on Cmd/Ctrl+K or clicking the top-nav search box. Global (not project-scoped) — searches Projects, Sessions, and a combined "Captured Context & Messages" group via `useSearchResults`. Independent of the Notes tab's own filter/list.

**Ask AI tab** — two stacked, single-purpose panels, not a chat thread:
- `ConversationSearchPanel` — keyword search over captured conversations (`useSearchConversations` → `POST /search/conversations`), retrieval-only, no generated answer.
- `RagQueryPanel` — single-question box (`useProjectQuery` → `POST /projects/{id}/query`), each submit replaces the previous answer (no scrollback), shows confidence (HIGH/MEDIUM/LOW) and a "Sources (N)" citation list linking back to source context_ids.
- Both are only ever mounted in this one tab.

**Notes tab** (`src/components/project/notes-feed.tsx` + the just-added `note-editor.tsx`/`note-editor.css`) — already deeply known from prior work this session, not re-detailed here except where relevant to a gap below:
- `NoteComposer` — expand-on-click, BlockNote-based (as of this session), 800ms-debounced autosave, "Saving…/Saved" indicator.
- `NoteCard` — expands in place. For `kind === "written"` notes, the body is now a live BlockNote editor (click-anywhere-to-edit, autosaves). For everything else, read-only `MarkdownContent`.
- `NoteListItem` — a second, compact, day-grouped list in a left sidebar **inside the Notes tab itself**, duplicating the center feed's content and previews.
- Colored dots: rose = "Mine" (`platform === 'note'`), indigo = "Captured" (anything else). **No legend or tooltip anywhere explains this** (grepped the whole `src` tree — confirmed).

**Styling system**: `components.json` confirms `style: "base-nova"`, `baseColor: "neutral"`, no separate `tailwind.config.*` (pure CSS-first v4, tokens in `globals.css`'s `@theme inline` block). Dark mode is a `.dark` class (`theme-store.ts` + `theme-provider.tsx`, toggle button lives in `top-nav.tsx`). **No `next/font` usage anywhere** — the app actually renders in the system UI font stack (`-apple-system, BlinkMacSystemFont, 'SF Pro Text/Display', 'Inter', system-ui, sans-serif` hardcoded in `globals.css`); `--font-geist-mono` is referenced as a token but never loaded. Framer Motion is **not installed**.

### 1.2 Backend (`Backend context-workspace/`, FastAPI, SQLAlchemy 2.0 async, PostgreSQL, ChromaDB, Alembic)

**Models**:
- `Project` — `id, name, description, user_id (FK users, CASCADE)`, `TimestampMixin`.
- `Session` — `id, project_id (FK), source_platform, title, session_state` (FSM), `bootstrap_message, attempt, tab_url, linked_url, link_status, linked_at, failed_at, failure_reason, created_at` (no `updated_at`).
- `Context` — `id, session_id (FK), idempotency_key (unique), title, messages_count, platform, chat_url, content_md, source, page_title, prompt_text, user_note, kind ("captured"|"written"), chapter_id (indexed UUID, no FK), raw_content (JSONB, not null), structured_content (JSONB), tags (JSONB), metadata_ (JSONB), created_at, updated_at`.
- **No `Chapter`/`Book` model exists anywhere.** `chapter_id`'s own code comment says it's "populated by the Phase 3 clustering job" — that job doesn't exist in the codebase either. It is a fully orphaned column: no table, no FK, no relationship, no writer.
- Auth (`User`, `AuthSession`) is fully implemented — bearer JWT + refresh rotation, enforced via `CurrentUserDep` on every project/session/context/search route. The dashboard gates on it (`(workspace)/layout.tsx`) and the extension sends it (`authorizedFetch.ts`, one-shot silent refresh on 401). This resolves what an earlier, unrelated plan file on this machine treated as unbuilt — it exists and works today.

**Migrations** (`alembic/versions/`, 8 total): `0001` initial schema → `0002` session tab_url → `0003` session link fields → `0004` session lifecycle FSM columns → `0005` context capture fields + perplexity platform string → `0006` users/auth_sessions → `0007` project ownership → `0008` notebook/note fields (content_md, source, page_title, prompt_text, user_note, kind, chapter_id). No chapters table in any migration.

**Title generation**: 100% client-supplied. The dashboard's `createNote` (`src/lib/api/services/project.service.ts`) sends `title: "[Note] ${trimmed.slice(0, 80)}"`; the extension's `handleNoteSave` (`background.ts`) does the identical `[Note] ${first 80 chars}…` truncation independently. The backend (`ContextService.capture_conversation`) stores whatever `title` string it's given, verbatim, with no truncation, no word-boundary handling, no quote-stripping, and **no AI/LLM involvement anywhere** — the only OpenAI call in the whole backend is `openai_generator.generate_answer()`, used exclusively for RAG answer text, never for titles.

**Duplicate detection**: the `idempotency_key` mechanism only catches literal retry-of-the-same-request duplicates (identical key). It does **not** catch genuine duplicate content: both the dashboard composer and the extension's note-save path generate a fresh `crypto.randomUUID()` on every save, so saving the same text twice creates two fully separate, fully indexed `Context` rows with no reconciliation. There is **no content-hash, text-equality, or embedding-similarity dedup check anywhere in the codebase** (confirmed by grep — the only near-hits are unrelated: RAG candidate-query deduping, a `SEMANTIC_SIMILARITY_FLOOR` used for *search suggestions*, not capture-time dedup). The extension's own type system already has unused `'DUPLICATE' | 'PROJECT_MISMATCH'` error-code stubs (`src/types/messages.ts`) that are never thrown or handled anywhere — a planned feature that was never wired up.

**Retrieval** (`app/core/rag/pipeline.py`): genuinely hybrid — BM25 (`rank_bm25`, built fresh per query from all project chunks) + ChromaDB vector search, fused via Reciprocal Rank Fusion, reranked with a cross-encoder, confidence-graded (HIGH/MEDIUM/LOW), with corrective retrieval (query expansion/simplification) on LOW/MEDIUM.

- `POST /search/conversations` (`search.py`) — retrieval-only (no LLM), returns per-note groupings keyed by `context_id` (field is misleadingly named `conversation_id` in the response schema, but it is the note's context_id) with `top_relevant_snippets`. This is the endpoint a "related notes" panel should reuse directly.
- `POST /projects/{id}/query` (`projects.py`) — full RAG Q&A, OpenAI-generated answer (HIGH/MEDIUM confidence only), `citations: [{context_id, chunk_id, platform, title, chat_url, excerpt, reranker_score}]` — correctly named and already link-back-to-source-ready.

### 1.3 Chrome extension (`chrome_extention_scrapping'/`, MV3)

- **Selection capture** (`src/content/note-cs.ts`, injected on chatgpt.com/chat.openai.com/claude.ai/gemini.google.com — **not** perplexity.ai): floating "note bar" on a ≥2-char text selection outside editable elements. Captures the selection as HTML → Markdown (Turndown + GFM), best-effort finds the preceding user prompt via per-platform DOM selectors (truncated to 2000 chars, stored in `prompt_text`), grabs `document.title`/`location.href`. Sends `NOTE_SAVE_REQUEST` to `background.ts`.
- A second always-on floating launcher (FAB) offers "Save a note" (manual, empty textarea, `kind: "written"`), "Capture this conversation" (full multi-turn capture), "Open dashboard".
- **Popup** (`src/popup/`) — shows/switches an "active project" (`useWorkspaceStore`), full project list+search+create (`CreateProjectModal`, name-only, max 80 chars). **The note bar/launcher's own project `<select>` is a separate state** (`chrome.storage.local` key `cw_note_last_project`), not the popup's active-project store — two independent "which project" mechanisms today.
- **No "already saved" / duplicate warning anywhere** — confirmed: note-save always mints a fresh idempotency key; full-conversation capture derives one from `SHA-256(projectId:url:minuteBucket)` (dedupes only within the same minute) but the popup UI never reads the response's `created: false` flag, so even that narrow case shows an identical success card either way.
- **Payload shapes match the backend schema exactly**, field-for-field, on both capture paths (`idempotency_key, platform, chat_url, captured_at, title, messages[], metadata, kind, prompt_text, page_title`).
- **Auth**: fully wired (`authorizedFetch.ts` attaches `Authorization: Bearer`, one-shot silent refresh on 401; popup/side panel gate behind `LoginGate.tsx`).
- **Dead code worth knowing about**: Perplexity is recognized by the backend schema and the full-capture extractor's platform-detection logic, but has no manifest `host_permissions` entry and no content-script match — 100% unreachable today.

---

## 2. Gap Analysis

### Step 2 items (Notes page fixes)

| # | Item | Current state | Target | Scope |
|---|------|----------------|--------|-------|
| 1 | Bad auto-titles | Client truncates to `[Note] <first 80 chars>` (dashboard AND extension, independently). Backend stores it verbatim, no AI, no word-boundary/quote handling. **Mitigating factor found**: the Notes tab itself never shows this raw title for notes — `getDisplayTitle()` already ignores `context.title` for `platform==='note'` and derives a display title from the body preview instead. So the ugly title likely still surfaces in the command palette's "Captured Context & Messages" results and anywhere else that reads `context.title` directly — **not independently verified which surfaces do this**, flagged as a follow-up check, not asserted as fact. | AI-generated short title at capture time; fallback strips leading quote marks and truncates at a word boundary + ellipsis. | Frontend (fallback util, used in `getDisplayTitle`-adjacent paths) + Backend (LLM title call, reusing the `openai_generator.py` pattern) + Extension (stop sending pre-truncated titles, or accept backend overriding them). |
| 2 | Duplicated sidebar | Notes tab has its own internal `NoteListItem` sidebar, redundant with the center feed. This is on top of — not the same as — the separate, persistent, app-wide `Sidebar` (Dashboard/Projects/Sessions/Saved Contexts). | Title-only navigator (click scrolls+highlights) OR removal in favor of Phase 2's shell. | Frontend-only either way. |
| 3 | Duplicate captures | No content-based dedup anywhere (confirmed by grep). Idempotency key is retry-safety only. Extension already has unused `DUPLICATE` error-code stubs. | Content-hash (or embedding-similarity) check on save; extension shows "Already saved in `<project>`". | Backend (new hash column + migration + check-before-insert) + Extension (wire the existing stub) + Dashboard composer (same check). |
| 4 | Unclear labels | "Mine" lumps together `kind="captured"` (a page selection) and `kind="written"` (typed manually) — **the DB already distinguishes these via the existing `kind` column**, the UI just doesn't surface it. No legend/tooltip anywhere (confirmed). A second, non-cross-referenced color scheme for "note" exists in `rag-query-panel.tsx`'s `PLATFORM_COLORS`. | Clear semantics — e.g. split "Mine" into "Selected" vs "Written" using data that already exists, plus a legend/tooltip. | Frontend-only, **zero schema changes needed** for the split itself. |
| 5 | Edit mode feels like a raw form | **Substantially already fixed this session**: `NoteCard` now uses a borderless, auto-growing BlockNote editor with a "Saving…/Saved" indicator, for `kind === "written"` notes. Remaining gaps: no Esc-to-exit behavior (there's no "collapse" concept for an always-editable card); BlockNote's own drag handles haven't been visually verified to stay inside card padding on all content widths. | Confirm/polish the above; decide whether `kind === "captured"` notes should also become editable (ties into item 4's "edited" state). | Frontend-only, small. |
| 6 | Captured chat content is one blob | **Partially not what it seems**: multi-message full-conversation captures (`messages.length > 1`) already render each turn as a separate, role-labeled, markdown-rendered block. The actual gap is narrower: single-selection note captures store a separate `prompt_text` (the preceding question) in its own DB column and it's already returned to the frontend (`ApiContext.prompt_text` exists in `types/index.ts`) — but **`notes-feed.tsx` never reads or renders it anywhere**. The captured answer is shown alone, with no visible preceding question. | Render `prompt_text` as its own labeled block above the captured passage, when present. | Frontend-only — the data already exists end-to-end, this is a pure display gap. |
| 7 | Small items | No source favicon anywhere (chip is text-only). No project-scoped search/filter in the Notes tab (only a coarse All/Captured/Mine toggle) — the global Cmd+K palette exists but isn't project-scoped and is a separate UI. | Favicon next to source chip; free-text search within a project's notes. | Frontend-only. Favicon can be derived client-side from `chat_url`'s origin (e.g. a favicon service) with no backend change, or captured more reliably by the extension at capture time (small extension change) — flagged as a design choice, not decided here. |

### Step 3 items (target phases)

| Phase | Target | Current state / dependency | Scope |
|-------|--------|------------------------------|-------|
| 2: App shell | Three-pane layout (left nav w/ Inbox+Projects+chapters, center, right context panel); Cmd+K already exists but would need to become more central; Ask AI becomes contextual in the right panel. | The app-wide `Sidebar` and global `SearchDialog` already exist and are a solid base to extend. **No right-panel/context-panel concept exists anywhere today** — this is entirely new. The "chapters of the current project's book" nav item has a hard dependency on a `Chapter` model that doesn't exist (see Phase 6) — either that nav item ships without chapters until Phase 6 lands a minimal Chapter table, or a slice of Phase 6 gets pulled forward. | Frontend (large layout restructure) + Backend (minimal Chapter table, if pulled forward). |
| 3: Inbox + AI filing | All captures land in an Inbox; AI suggests a project; dedup warnings surface here. | **No Inbox concept exists at all** — today the extension requires picking a project (or reuses the last-used one) before every capture. This needs a real design decision (see Open Questions) on whether "Inbox" means a nullable `project_id` or an auto-created hidden project per user, because ChromaDB collections and all retrieval today are strictly per-project. | Backend (new classification endpoint + Inbox storage model) + Extension (capture-without-project-selection flow, a real behavior change to an already-working, durable-retry-queue capture pipeline — regression risk) + Dashboard (new Inbox UI). Depends on Phase 2 (nav placement) and Step-2-item-3 (dedup). |
| 4: Editor upgrade | Evaluate BlockNote vs TipTap; highlight-to-insight; strike-through instead of delete; version history. | **The BlockNote-vs-TipTap evaluation is effectively already resolved** — BlockNote (`@blocknote/core/react/shadcn`) is installed and wired for `kind === "written"` notes as of this session. Highlight-to-insight and version history need new storage (no "insights" or version-snapshot table/field exists — `tags` JSONB exists on `Context` and is currently unused anywhere in the UI, a candidate to repurpose). Strike-through-instead-of-delete conflicts with the delete flow shipped this session (hard SQL delete + ChromaDB chunk cleanup) — needs an explicit decision (see Open Questions) rather than silently becoming a soft-delete. | Frontend (editor extensions) + Backend (new fields/tables for insights + version history + possibly a `deleted_at` column if soft-delete is chosen). |
| 5: Related notes panel | "N other notes mention X" in the right panel; near-duplicate merge suggestions. | `POST /search/conversations` already returns exactly this shape (per-context groupings with snippets) — this phase is mostly a frontend consumer of an existing endpoint. Merge suggestions depend on Step-2-item-3's dedup mechanism being generalized to a broader similarity check. | Mostly frontend, but hard-depends on Phase 2's right panel existing. |
| 6: Book view (plan only) | AI-proposed chapter outline; synthesized section summaries with citations; "has new material" flags; reading mode + export. | **No Chapter/Book model, no clustering job, and no synthesis-per-chapter pipeline exist anywhere** — `chapter_id` is a fully orphaned column with a code comment referencing a "Phase 3 clustering job" that was never built. This phase requires, at minimum: a new `Chapter` table + migration, a clustering job (batch or on-demand), and a synthesis pipeline that extends the existing per-query RAG answer generation to per-chapter summaries with citations. "Has new material" can be computed cheaply once a `synthesized_at` timestamp exists on `Chapter`, by comparing against member contexts' `created_at`. | Backend-heavy (new model, migration, clustering, synthesis) + Frontend (new reading-mode view, export). Left at a planning level per your instruction — not detailed further here. |

---

## 3. Ordering and Dependencies

1. **Phase 1, no-schema frontend wins first** (independent of everything else, ship immediately): render `prompt_text` (item 6), split "Mine" into "Selected"/"Written" + add a legend (item 4), project-scoped search (item 7), sidebar → title-only navigator (item 2), editor polish (item 5).
2. **Phase 1, title generation** (item 1) — standalone backend + frontend work, no dependency on the above.
3. **Phase 1, duplicate detection** (item 3) — standalone backend schema + logic work. Do this before Phase 3, since Phase 3's "dedup warnings" reuses it.
4. **Phase 2 (app shell)** — depends on nothing above being done first, but the "chapters" nav entry should either be omitted until Phase 6 lands a minimal `Chapter` table, or that table gets built early as a small pulled-forward slice.
5. **Phase 3 (Inbox)** — depends on Phase 2 (nav) and the Phase 1 dedup mechanism. Extension changes here are the highest-regression-risk item in the whole plan (touching an already-working, durable-retry capture pipeline) — recommend feature-flagging or a parallel code path during rollout.
6. **Phase 4 (editor upgrade, remaining items)** — mostly independent, can interleave any time after Phase 1, except strike-through/soft-delete needs an explicit decision first (it changes behavior of the delete feature shipped this session).
7. **Phase 5 (related notes)** — depends on Phase 2's right panel.
8. **Phase 6 (book view)** — last, depends on a `Chapter` model existing (see #4) plus new clustering/synthesis infrastructure. Plan-only per your instruction.

---

## 4. Effort Estimates and Risks

| Item | Effort | Key risk |
|------|--------|----------|
| Render `prompt_text` | S | None — pure display, data already flows end-to-end. |
| Split Mine → Selected/Written + legend | S | None — uses existing `kind` field. |
| Project-scoped search | S | None — all contexts already client-side loaded. |
| Sidebar → title-only navigator | S | None. |
| Editor polish (Esc, handle placement) | S | Low. |
| AI title generation | M | Cost/latency per capture; recommend async (background-task, matching the existing RAG-indexing pattern) rather than blocking the capture response — flagged as an open question below. |
| Duplicate detection | M–L | Exact-hash dedup will miss near-duplicate rewordings; recommend starting with normalized-text hash only, deferring embedding-similarity fuzzy dedup to a later pass. |
| App shell (Phase 2) | L | Large surface-area layout change touching every workspace page; the "chapters" nav item has a hard, easy-to-miss dependency on Phase 6's data model. |
| Inbox + AI filing (Phase 3) | L | Extension capture-flow changes risk regressing an already-solid, durable-retry pipeline; needs a real architectural decision on what "no project yet" means given per-project ChromaDB collections. |
| Editor upgrade remainder (Phase 4) | M | Strike-through/soft-delete directly conflicts with the hard-delete-plus-vector-cleanup feature shipped this session — must be an explicit decision, not an assumed default. |
| Related notes panel (Phase 5) | M | Mostly frontend, but blocked until Phase 2 ships. |
| Book view (Phase 6) | L/XL | New model, new clustering job, new synthesis pipeline — the largest remaining unknown in the whole roadmap. |

---

## 5. Design Guidelines (calm, paper-like)

Derived from what's already established in the codebase, to keep Phase 1 visually consistent with the rest of the app rather than introducing a competing style:

- **Color**: keep using the existing CSS custom properties (`--card`, `--border`, `--muted-foreground`, `--accent`) rather than new hardcoded values — they already flip correctly between light/dark via the `.dark` class. Keep translucent borders (`border-border/60`) over solid ones; the app already leans this way and it reads calmer than hard-bordered forms (exactly the effect Step 2 item 5 is asking to fix).
- **Typography**: the existing micro-type scale (`text-[10px]/[11px]/[13px]/[15px]`) is already deliberate and consistent — reuse it rather than introducing new arbitrary sizes. The app currently has no loaded custom font (system UI stack only); introducing a distinct serif or humanist font specifically for note bodies could reinforce the "paper" feel, but that's a deliberate design decision to make explicitly, not something to slip in as a side effect (see Open Questions).
- **Motion**: Framer Motion is not installed and shouldn't be introduced casually — the codebase's existing `transition-colors`/`transition-all` CSS-transition convention is sufficient for a calm feel and keeps the bundle smaller.
- **Density**: current spacing (`p-3`/`p-4`, `gap-2`/`gap-3`, `rounded-xl`/`rounded-lg`) already trends toward "roomy but not sparse" — keep new panels (right context panel, Inbox) consistent with these values rather than inventing a new spacing scale.
- **Chrome**: avoid adding new persistent UI elements that compete for attention (the top-nav's cosmetic-only "syncing" indicator and non-functional notification bell are examples of chrome that doesn't earn its space — worth removing rather than emulating, not just leaving as-is).

---

## 6. Open Questions

1. **Sidebar duplication**: title-only navigator now (Phase 1, minimal), or fold straight into Phase 2's new left nav later (bigger, deferred)? These are different amounts of work and I don't want to build the wrong one.
2. **Soft-delete vs. the just-shipped hard delete**: Phase 4 asks for "strike-through instead of delete," which conflicts with the hard SQL-delete + ChromaDB-cleanup flow shipped this session. Should strike-through *replace* that (delete becomes reversible/soft), or should it be a separate, lighter "archive" step that sits before an unchanged permanent delete?
3. **Should captured notes become editable?** Today only `kind === "written"` notes are editable in place; captured (page-selection) notes stay read-only. Item 4's proposed "Captured · edited" state only makes sense if captured notes can be edited too — do you want to widen editability, or keep "edited" scoped to written notes only?
4. **What does "Inbox" mean structurally?** ChromaDB collections and all retrieval are strictly per-project today. Should an un-filed capture have `project_id = NULL` (meaning it's unsearchable/un-indexed until filed), or land in an auto-created hidden "Inbox" project per user (fully indexed and searchable immediately, just not yet organized)? This materially changes both the schema and the RAG pipeline's assumptions.
5. **Perplexity**: currently dead code (schema and extractor logic exist, but no manifest permission makes it unreachable). Worth reviving as part of this redesign, or should it be removed to reduce latent complexity instead of carried forward silently?
6. **Title generation timing**: synchronous (blocks the capture response on an LLM call) or asynchronous (capture returns instantly, title fills in shortly after — matching the existing RAG-indexing background-task pattern)? I'd lean async, but it changes what the capture response/UI needs to expect.
7. **Paper-like typography**: keep the current system-UI sans-serif everywhere, or introduce a distinct font for note bodies specifically to reinforce the "paper" feel? Not inferable from the code — a design call only you can make.

---

No code has been written or modified as part of this document. Waiting for your go-ahead before starting on any phase.
