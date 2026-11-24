"""
app/core/rag/index_db.py
─────────────────────────
The synchronous engine the search index (vector_store.py, vocabulary.py)
uses. Those run in worker threads, outside the request's async session; a
small psycopg2 pool on the app's own (pooled) database serves them.

Tests point it at the test database with use_engine().
"""

from __future__ import annotations

import threading

from sqlalchemy import Engine, create_engine

from app.core.settings import settings

_lock = threading.Lock()
_engine: Engine | None = None


def engine() -> Engine:
    global _engine
    if _engine is None:
        with _lock:
            if _engine is None:
                _engine = create_engine(
                    settings.sync_runtime_database_url,
                    pool_size=2,
                    max_overflow=3,
                    pool_pre_ping=True,
                    # Neon closes idle connections; recycle before it does.
                    pool_recycle=240,
                )
    return _engine


def use_engine(new: Engine | None) -> None:
    """Replace the engine (tests). None makes the next call build the default one."""
    global _engine
    with _lock:
        old, _engine = _engine, new
    if old is not None and old is not new:
        old.dispose()


def dispose() -> None:
    """Close pooled connections (app shutdown)."""
    use_engine(None)
