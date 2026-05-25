# AI Context Workspace — Backend

Production-grade FastAPI backend powering the AI Context Workspace platform: a system for capturing, storing, and structuring AI session content from ChatGPT, Claude, Gemini, and Google Docs.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [API Reference](#api-reference)
- [Running Tests](#running-tests)
- [Docker](#docker)
- [Project Structure](#project-structure)
- [Future Roadmap](#future-roadmap)

---

## Architecture

```
Request
  │
  ▼
FastAPI Router (app/api/v1/routes/)
  │  Pydantic v2 request validation
  ▼
Service Layer (app/services/)
  │  Business logic, orchestration, domain rules
  ▼
Repository Layer (app/repositories/)
  │  SQLAlchemy async queries; no business logic here
  ▼
PostgreSQL (via asyncpg + SQLAlchemy 2.0 async engine)
```

**Key patterns:**
- **Repository pattern** — all DB queries live in `repositories/`. Services never write raw SQL.
- **Service layer** — business rules, FK validation, and logging live in `services/`. Routes are thin.
- **Dependency injection** — `app/dependencies/` provides typed `Annotated[..., Depends(...)]` aliases consumed by route signatures.
- **Transaction-per-request** — `get_db_session` opens one `session.begin()` block per HTTP request; auto-rollback on exception.
- **Structured logging** — every log line is JSON (production) or coloured console (development), correlated by `request_id`.

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | FastAPI 0.115 |
| Runtime | Python 3.12, Uvicorn + uvloop |
| ORM | SQLAlchemy 2.0 (async) |
| Driver | asyncpg |
| Migrations | Alembic |
| Validation | Pydantic v2 |
| Logging | structlog |
| Testing | pytest-asyncio, httpx |
| Containers | Docker, Docker Compose |

---

## Quick Start

### Local (no Docker)

```bash
# 1. Clone and enter the project
cd ai-context-workspace

# 2. Create a virtual environment
python -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy and configure environment
cp .env.example .env
# Edit POSTGRES_* values to match your local PostgreSQL

# 5. Run migrations
alembic upgrade head

# 6. Start the dev server
uvicorn main:app --reload --log-level debug
```

API is now at `http://localhost:8000`  
Interactive docs at `http://localhost:8000/docs`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `development` | `development` \| `staging` \| `production` |
| `DEBUG` | `false` | Enable SQLAlchemy echo + debug docs |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `ai_context_workspace` | Database name |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated CORS origins |
| `LOG_LEVEL` | `INFO` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` |
| `LOG_FORMAT` | `json` | `json` (production) \| `console` (development) |
| `REDIS_HOST` | `localhost` | Redis host (future-ready) |
| `REDIS_PORT` | `6379` | Redis port (future-ready) |

See `.env.example` for the full list including future placeholders.

---

## Database Migrations

```bash
# Apply all migrations
alembic upgrade head

# Create a new migration (after editing models)
alembic revision --autogenerate -m "add notes table"

# View current revision
alembic current

# Roll back one step
alembic downgrade -1

# Emit SQL without applying (for review / audit)
alembic upgrade head --sql
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe — always fast |
| `GET` | `/health/db` | Readiness probe — tests DB connectivity |

### Projects

| Method | Path | Description |
|---|---|---|
| `POST` | `/projects` | Create a project |
| `GET` | `/projects` | List all projects (`?offset=0&limit=50`) |
| `GET` | `/projects/{id}` | Get a project by ID |
| `PATCH` | `/projects/{id}` | Partial update |
| `DELETE` | `/projects/{id}` | Delete (cascades to sessions & contexts) |

### Sessions

| Method | Path | Description |
|---|---|---|
| `POST` | `/sessions` | Create a session |
| `GET` | `/sessions/{project_id}` | List sessions for a project |
| `GET` | `/sessions/detail/{session_id}` | Get a session by ID |

**source_platform** allowed values: `chatgpt`, `claude`, `gemini`, `docs`, `unknown`

### Contexts

| Method | Path | Description |
|---|---|---|
| `POST` | `/contexts` | Capture a context |
| `GET` | `/contexts/{session_id}` | List contexts for a session |
| `GET` | `/contexts/detail/{context_id}` | Get a context by ID |

#### Context payload example (Chrome extension → API)

```json
{
  "session_id": "uuid",
  "raw_content": {
    "type": "conversation",
    "messages": [
      { "role": "user",      "content": "Explain RAG" },
      { "role": "assistant", "content": "RAG stands for…" }
    ],
    "url": "https://claude.ai/chat/abc123",
    "captured_at": "2025-01-01T12:00:00Z"
  },
  "tags": ["rag", "ai", "research"],
  "metadata": {
    "browser": "Chrome",
    "extension_version": "1.2.0",
    "page_title": "Claude"
  }
}
```

---

## Running Tests

```bash
# Install test dependencies (included in requirements.txt)
pip install -r requirements.txt

# Set up a test database (one-time)
createdb ai_context_workspace_test

# Run the full suite
pytest

# Run with verbose output
pytest -v

# Run a specific file
pytest tests/api/test_projects.py

# Run with coverage report
pytest --cov=app --cov-report=html
open htmlcov/index.html
```

> Tests use transaction rollback isolation — no data persists between tests and no cleanup is needed.

---

## Docker

### Development (hot-reload)

```bash
# Start backend + postgres
docker compose up

# Start backend + postgres + redis
docker compose --profile redis up

# Run migrations inside the container
docker compose exec backend alembic upgrade head

# View logs
docker compose logs -f backend
```

### Production build

```bash
docker build -t ai-context-workspace:latest .
docker run -p 8000:8000 --env-file .env ai-context-workspace:latest
```

---

## Project Structure

```
ai-context-workspace/
├── main.py                        # App factory + lifespan
├── requirements.txt
├── .env.example
├── alembic.ini
├── pyproject.toml                 # pytest + ruff config
├── Dockerfile                     # Multi-stage production image
├── docker-compose.yml             # Local dev stack
│
├── alembic/
│   ├── env.py                     # Migration environment
│   ├── script.py.mako
│   └── versions/
│       └── 0001_initial_schema.py
│
└── app/
    ├── api/
    │   └── v1/
    │       ├── __init__.py        # Aggregates all routers → api_router
    │       └── routes/
    │           ├── health.py
    │           ├── projects.py
    │           ├── sessions.py
    │           └── contexts.py
    │
    ├── core/
    │   ├── settings.py            # Pydantic Settings — single source of truth
    │   ├── logging.py             # structlog configuration
    │   └── exceptions.py         # Domain exceptions + FastAPI handlers
    │
    ├── db/
    │   ├── base.py                # DeclarativeBase + model imports for Alembic
    │   └── engine.py              # Async engine, session factory, lifecycle
    │
    ├── models/
    │   ├── mixins.py              # UUIDPrimaryKeyMixin, TimestampMixin
    │   ├── project.py
    │   ├── session.py
    │   └── context.py             # JSONB columns: raw_content, structured_content
    │
    ├── schemas/
    │   ├── base.py                # AppBaseModel, PaginatedResponse
    │   ├── project.py
    │   ├── session.py
    │   └── context.py
    │
    ├── repositories/
    │   ├── base.py                # Generic async CRUD: get, list, create, update, delete
    │   ├── project.py
    │   ├── session.py
    │   └── context.py
    │
    ├── services/
    │   ├── project.py             # Business logic + domain validation
    │   ├── session.py
    │   └── context.py
    │
    ├── dependencies/
    │   └── __init__.py            # Typed Depends() aliases for route injection
    │
    ├── middleware/
    │   └── logging.py             # Request ID injection + structured access logs
    │
    ├── utils/
    │   └── redis.py               # Redis stub — future-ready placeholder
    │
    └── workers/
        └── __init__.py            # Placeholder for AI pipeline workers
```

---

## Future Roadmap

The architecture is already structured to accommodate these without major refactoring:

| Feature | Where to add |
|---|---|
| **Authentication / JWT** | `app/middleware/auth.py` + `app/dependencies/auth.py` |
| **Rate limiting** | `app/middleware/rate_limit.py` + Redis `app/utils/redis.py` |
| **AI extraction pipeline** | `app/workers/ai_extraction.py` + task broker |
| **Vector embeddings** | `app/models/embedding.py` + pgvector migration |
| **Semantic search** | `app/repositories/context.py` + `app/api/v1/routes/search.py` |
| **WebSocket sync** | `app/api/v1/routes/ws.py` + Redis pub/sub |
| **Background jobs** | `app/workers/` + arq or Celery broker |
| **Notes resource** | Follow the Project pattern: model → schema → repo → service → route |
| **Multi-tenancy** | Add `workspace_id` FK to all models via Alembic migration |
