# Codebase Analysis Report
## Context Workspace + Advanced RAG Pipeline

**Prepared by:** Claude Code (Senior AI Solutions Architect analysis)  
**Date:** 2026-06-22  
**Repository branch:** master (latest commit: cbba143)

---

## Executive Summary

**Context Workspace** is a full-stack AI productivity system that acts as a persistent memory layer on top of AI chat platforms (ChatGPT, Claude, Gemini, Perplexity). Users install a Chrome Extension that captures conversations from any AI tab at the click of a button. Captured data flows through a FastAPI backend into PostgreSQL and surfaces in a Next.js dashboard where conversations can be reviewed, searched, and organized into projects.

Alongside this, the repository contains **Advanced RAG Pipeline** — a standalone, production-grade Retrieval-Augmented Generation system built for HR policy Q&A. It implements a complete hybrid retrieval chain (BM25 + semantic vector search → RRF fusion → cross-encoder reranking → extractive QA) with a Streamlit UI and self-grading confidence system. This pipeline is not yet connected to the backend (integration is the next roadmap item).

---

## Technology Stack

### RAG Pipeline
| Component | Technology |
|-----------|-----------|
| Document loading | Custom `DocumentLoader` — reads `.txt` files from `data/` |
| Chunking | Token-based sliding window — 250 tokens, 50 overlap (`Chunker`) |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` (384-dim dense vectors) via `SentenceTransformer` |
| Vector store | **ChromaDB** (local persistent at `.chromadb/`) |
| Sparse retrieval | **BM25 Okapi** via `rank-bm25` library |
| Retrieval fusion | **Reciprocal Rank Fusion** (k=60), custom implementation |
| Reranking | `cross-encoder/ms-marco-MiniLM-L-6-v2` via `sentence-transformers CrossEncoder` |
| Extractive QA | `deepset/roberta-base-squad2` via HuggingFace `transformers` + `torch` |
| UI | **Streamlit** with 4 tabs per query (Answer, Retrieval Details, Latency, Interview Explanation) |
| Evaluation | Standalone `evaluation.py` with sample HR queries |

### Backend
| Component | Technology |
|-----------|-----------|
| Framework | **FastAPI 0.115.5** (Python 3.12) |
| Async server | **uvicorn** with uvloop |
| ORM | **SQLAlchemy 2.0** async (asyncpg driver) |
| Database | **PostgreSQL** |
| Migrations | **Alembic** (5 versioned migration files) |
| Validation | **Pydantic v2** + pydantic-settings |
| Logging | **structlog** (structured JSON logs) |
| Cache/Queue | **Redis** (wired, future-ready) |
| Testing | pytest, pytest-asyncio, httpx TestClient |
| Containerisation | Multi-stage Docker (`python:3.12-slim`) |

### Chrome Extension
| Component | Technology |
|-----------|-----------|
| Manifest | V3 (service worker based) |
| UI framework | **React 18** + **Tailwind CSS 3** + **Framer Motion 11** |
| State management | **Zustand 4** with custom `chrome.storage.local` adapter |
| Build | **Vite** (two IIFE configs: popup + sidepanel) + esbuild for background.ts |
| Content scripts | Vanilla JS per-platform (chatgpt-cs, claude-cs, gemini-cs, perplexity-cs) |

### Frontend Dashboard
| Component | Technology |
|-----------|-----------|
| Framework | **Next.js** (App Router) |
| Data fetching | **TanStack Query v5** (React Query) |
| Language | **TypeScript** |
| Styling | Tailwind CSS |

---

## RAG Pipeline — Detailed Implementation

```
Document Source (TXT files — 9 HR policy documents)
          │
          ▼
  DocumentLoader (ingestion/loader.py)
  · Reads *.txt from data/ directory
  · Creates Document(doc_id=filename, title, text)
          │
          ▼
  Chunker (ingestion/chunker.py)
  · Token-based sliding window
  · chunk_size=250 tokens, overlap=50 tokens
  · Creates DocumentChunk(chunk_id, doc_id, title, text, metadata)
          │
          ▼
  EmbeddingGenerator (ingestion/embedding_generator.py)
  · Model: sentence-transformers/all-MiniLM-L6-v2
  · Produces 384-dimensional dense float vectors
  · Uses SentenceTransformer.encode()
          │
          ▼
  IndexBuilder (ingestion/index_builder.py)
  · Persists chunks + embeddings to ChromaDB
  · Collection: "advanced_rag_collection"
  · Persistent path: .chromadb/
          │
          ▼
┌─────────────────── Query Time ───────────────────────┐
│                                                       │
│  QueryTransformer (retrieval/query_transform.py)      │
│  · Typo correction (TYPO_MAP dictionary)             │
│  · Acronym expansion (2FA→two-factor auth, etc.)     │
│  · Synonym normalisation (vacation→leave, etc.)      │
│  · Multi-subquery splitting (on 'and/or/;/?')        │
│                                                       │
│         For each subquery:                            │
│              │                                        │
│    ┌─────────┴──────────┐                            │
│    ▼                    ▼                            │
│  BM25Retriever     VectorRetriever                   │
│  (rank_bm25)       (ChromaDB + all-MiniLM-L6-v2)   │
│  top_k=10          top_k=10                          │
│    └─────────┬──────────┘                            │
│              ▼                                        │
│      RRF Fusion (retrieval/rrf.py)                   │
│      · score += 1/(60 + rank) per retrieval system  │
│      · Scale-invariant (uses ranks not raw scores)  │
│      · fused_top_k=20                                │
│              │                                        │
│              ▼                                        │
│  CrossEncoder Reranker (retrieval/reranker.py)       │
│  · Model: cross-encoder/ms-marco-MiniLM-L-6-v2      │
│  · Jointly encodes [query, passage] pairs            │
│  · rerank_top_k=5                                    │
│              │                                        │
│              ▼                                        │
│  Confidence Grader (retrieval/retrieval_grader.py)   │
│  · HIGH: top_score > 2.0 AND margin > 5.0           │
│  · MEDIUM: top_score > 0.0                          │
│  · LOW: top_score ≤ 0.0                             │
│  · Upgrade: MEDIUM→HIGH if BM25 rank≤10 AND         │
│    vector rank≤10 AND top_score > 1.0               │
│  · Downgrade: HIGH→MEDIUM if neither method         │
│    retrieved doc directly                            │
│              │                                        │
│         [if LOW/MEDIUM confidence]                   │
│              ▼                                        │
│  Corrective Retrieval (ui/streamlit_app.py)          │
│  Strategy 1: synonym_expansion (expand_query)        │
│  Strategy 2: query_simplification (simplify_query)  │
│  · Adopts first strategy that improves top_score    │
│  · Max 2 attempts total                              │
│              │                                        │
│              ▼                                        │
│  ExtractiveQA (generation/extractive_qa.py)          │
│  · Model: deepset/roberta-base-squad2                │
│  · Predicts start/end token spans                    │
│  · Score = sigmoid(best_span_logit / 2)             │
│  · Fallback: return full top chunk if HIGH/MEDIUM    │
│    confidence but no confident span found            │
│              │                                        │
│              ▼                                        │
│  Answer + Citation (generation/citation_builder.py)  │
│  · citation = f"{source_doc} | {chunk_id}"          │
└───────────────────────────────────────────────────────┘
```

### Documents Indexed (9 HR policies)
- `acceptable_use.txt`
- `expense_reimbursement.txt`
- `leave_policy.txt`
- `offboarding.txt`
- `onboarding_process.txt`
- `performance_review.txt`
- `remote_work_policy.txt`
- `security_policy.txt`
- `travel_policy.txt`

### Models Used
| Model | Purpose | Size |
|-------|---------|------|
| `sentence-transformers/all-MiniLM-L6-v2` | Document & query embeddings | ~80MB |
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | Reranking | ~67MB |
| `deepset/roberta-base-squad2` | Extractive QA (span extraction) | ~500MB |

---

## Architecture — All Major Components

### 1. Chrome Extension (`chrome_extention_scrapping'/`)
- **Popup** (`src/popup/`): React 18 SPA rendered inside popup.html. Tabs: Projects, Platforms, Activity. Uses Zustand store.
- **Background Service Worker** (`src/background.ts`): Handles `CAPTURE_CONTEXT_REQUEST` messages. Uses `chrome.scripting.executeScript` to inject extraction logic directly into target tabs.
- **Content Scripts** (`content-scripts/`): Per-platform scripts (chatgpt-cs, claude-cs, gemini-cs, perplexity-cs) for auto-scroll and DOM hydration.
- **CaptureQueue** (`src/core/CaptureQueue.ts`): Durable queue in `chrome.storage.local`. Entries tracked with status, attempts, exponential backoff.
- **SessionOrchestrator** (`src/core/SessionOrchestrator.ts`): Manages tab lifecycle for AI sessions.
- **TabManager** (`src/core/TabManager.ts`): Per-tab state tracking.
- **Build**: Two Vite IIFE configs (popup.js, sidepanel.js) + esbuild for background.ts. Postbuild script copies manifest, icons, HTML to `dist/`.

### 2. FastAPI Backend (`Backend context-workspace/`)
- **main.py**: `ExtensionCORSMiddleware` pure-ASGI shim handles `chrome-extension://` origins. `_build_app()` factory wraps FastAPI with the shim in development.
- **Routes** (`app/api/v1/routes/`):
  - `GET /api/v1/health` — liveness + readiness probe
  - `GET /api/v1/projects` — paginated project list with counts
  - `POST /api/v1/projects` — create project
  - `POST /api/v1/projects/{id}/capture` — idempotent conversation capture
  - Sessions and context CRUD routes
- **Services**: `ProjectService`, `SessionService`, `ContextService` — business logic layer.
- **Repositories**: `ProjectRepository`, `SessionRepository`, `ContextRepository` — SQLAlchemy async queries.
- **Models**: `Project`, `Session`, `Context` with JSONB `raw_content`, `metadata_` columns.
- **Migrations** (Alembic): 5 sequential migrations including `0005_context_capture_fields.py` adding `idempotency_key` (with UNIQUE partial index), `title`, `platform`, `chat_url`, `messages_count` to the `contexts` table.

### 3. Next.js Dashboard (`context-workspace/`)
- Project management with session/context viewer
- `CapturedContextList` component: shows platform badge (color-coded by platform), title, clickable chat URL, messages with role labels, expand/collapse for long conversations
- TanStack Query for server-state management
- `ApiContext` type mirrors backend `ContextResponse` schema

### 4. Advanced RAG Pipeline (`RAG Pipeline/advanced-rag/`)
- Standalone Python app with Streamlit UI
- `@st.cache_resource` caches the full pipeline (BM25, vector, reranker, QA models) to avoid reloading on each query
- `run_single_query()` orchestrates the full pipeline with per-stage timing in milliseconds
- `_explain_pipeline()` generates interview-quality explanations of each retrieval decision
- `_render_failure_examples()` shows canonical BM25 vs vector vs hybrid use cases

---

## Data Ingestion Flow

```
1. User browses AI platform (ChatGPT, Claude, Gemini, Perplexity)
2. Clicks "Capture Context" in Chrome Extension popup
3. Extension calls chrome.tabs.query to get active tab
4. Computes SHA-256 idempotency key = hash(projectId + url + minute-bucket)
5. Sends CAPTURE_CONTEXT_REQUEST to background service worker
6. Background injects extraction function via chrome.scripting.executeScript:
   a. Auto-scrolls page to load lazy content (top → bottom)
   b. Detects platform from document.location.hostname
   c. Tries platform-specific DOM selectors:
      - ChatGPT: [data-message-author-role]
      - Claude: [data-testid="human-turn/ai-turn"]
      - Gemini: user-query / model-response elements
      - Perplexity: class-based selectors
   d. Falls back to document.body.innerText (capped at 50k chars)
   e. Returns {ok, title, platform, messages[], metadata}
7. Background enqueues to CaptureQueue
8. Sends POST /api/v1/projects/{id}/capture with JSON payload
9. Backend checks idempotency_key → upserts session → inserts context
10. Context appears in Next.js dashboard under project's "Captured Context" tab
```

---

## Query Flow (RAG Pipeline)

```
1. User types question in Streamlit text input
2. transform_query_full(): typo correction → acronym expansion → synonym normalisation → subquery splitting
3. For each subquery (in parallel conceptually, sequential in implementation):
   a. BM25: tokenise → BM25Okapi.get_scores() → sort → top 10
   b. Vector: embed query → ChromaDB.query() → cosine similarity → top 10
   c. RRF: merge ranks → rrf_score += 1/(60+rank) → top 20
   d. Reranker: CrossEncoder.predict([query, text] pairs) → sort by score → top 5
   e. Confidence grader: classify HIGH/MEDIUM/LOW
   f. If not HIGH: try corrective retrieval strategies
   g. ExtractiveQA: RoBERTa predicts start/end token → fallback to full chunk
   h. Build citation from source_doc + chunk_id
4. Render results in 4 tabs with latency breakdown
```

---

## My Contributions (Inferred from Codebase)

Based on the code design, commit history, and architectural decisions visible in the codebase:

1. **Advanced RAG Pipeline design and implementation** — complete pipeline from document loading through extractive QA, including the composite confidence grading system (top-score + margin + retrieval agreement) which required iterative tuning of thresholds for the cross-encoder model.

2. **Chrome Extension React redesign** — migrated from vanilla JS popup to React 18 + Tailwind + Framer Motion + Zustand, including the Vite IIFE build pipeline to work around Chrome extension MIME type restrictions.

3. **Context capture pipeline** — designed the executeScript-based extraction approach (replacing unreliable sendMessage), implemented the durable CaptureQueue with exponential backoff, and the SHA-256 idempotency scheme.

4. **CORS architecture fix** — diagnosed the three-layer CORS suppression bug (BaseHTTPMiddleware eating headers + ghost process) and implemented the pure-ASGI `ExtensionCORSMiddleware` shim.

5. **Database schema evolution** — designed and migrated Alembic schema additions for idempotent capture (0005_context_capture_fields.py).

6. **Full-stack integration** — connected extension → backend → frontend end-to-end, including schema alignment between `CaptureConversationRequest`, `ContextResponse`, and frontend `ApiContext` type.

---

## Production Readiness Assessment

**Status: MVP / Internal Tool**

### What is production-ready:
- ✅ Multi-stage Docker build with non-root user and health check
- ✅ Alembic migration pipeline (reproducible schema)
- ✅ Repository + Service pattern (testable, maintainable)
- ✅ Structured logging (structlog JSON) with request correlation
- ✅ pytest-asyncio test suite (API routes, services, repositories)
- ✅ Idempotent capture (SHA-256 dedup prevents duplicates)
- ✅ Durable capture queue with exponential backoff
- ✅ CORS properly handled for extension origins
- ✅ Pydantic v2 request/response validation
- ✅ Docker Compose for local development

### What is missing for production:
- ❌ RAG pipeline not connected to backend (planned as `/api/v1/projects/{id}/query`)
- ❌ Authentication / JWT (no auth layer on any endpoint)
- ❌ Rate limiting (no throttling on capture endpoint)
- ❌ Redis not yet used (wired but empty `app/workers/`)
- ❌ No generative LLM layer (only extractive QA with RoBERTa)
- ❌ No vector search on captured contexts
- ❌ Frontend auth (no login flow)
- ❌ CI/CD pipeline not present in repository

---

## Challenges Visible from Code Design

### 1. Chrome Extension + CORS (RESOLVED)
**Problem:** `BaseHTTPMiddleware` in Starlette silently consumes inner middleware headers. Combined with a ghost uvicorn process holding port 8000, CORS headers were never reaching the extension.  
**Solution:** Pure-ASGI `ExtensionCORSMiddleware` shim, operating above all Starlette middleware.

### 2. Content Script Lifecycle Dependency (RESOLVED)
**Problem:** `chrome.tabs.sendMessage` requires content script to be pre-registered and listening — fails on any non-AI-platform tab or if the CS hasn't loaded yet.  
**Solution:** `chrome.scripting.executeScript` injects extraction logic on-demand, no pre-registration required.

### 3. RAG Confidence Metric Design (RESOLVED)
**Problem:** Averaging cross-encoder scores across all candidates produces strongly negative values even when the top result is excellent, causing false-positive corrective retrieval triggers.  
**Solution:** Composite metric: `top_score > threshold AND score_margin > threshold`, upgraded/downgraded by retrieval agreement between BM25 and vector search.

### 4. Vite ESM MIME Type Error (RESOLVED)
**Problem:** Chrome extension resource server returns JS files as `application/octet-stream`, blocking `type="module"` script loading.  
**Solution:** Two separate Vite configs producing IIFE bundles; HTML files use plain `<script src="...">` without `type="module"`.

### 5. Projects Never Loading (RESOLVED)
**Problem:** `getProjects()` typed as `Promise<ApiProjectItem[]>` but backend returned `{ items, total }`. Calling `.map()` on an object failed silently.  
**Solution:** Unwrap `.items` from paginated response in `api.ts`.

---

## Roadmap (Identified from Code Comments and Architecture Gaps)

1. **Connect RAG to Backend** — Add `POST /api/v1/projects/{id}/query` endpoint that routes questions through the RAG pipeline against captured contexts
2. **LangGraph Corrective Loop** — Formalize the corrective retrieval logic as a LangGraph state machine with conditional edges
3. **Semantic Search** — Embed all captured contexts with all-MiniLM-L6-v2; store vectors in pgvector or ChromaDB; expose `/search` endpoint
4. **LLM Generative Layer** — Add GPT-4o or Claude 3.5 answer generation on top of retrievals
5. **Authentication** — JWT auth for API and frontend
6. **Redis Task Queue** — Background jobs for embedding, re-indexing, and async capture processing
