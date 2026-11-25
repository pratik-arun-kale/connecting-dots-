"""
app/core/rag/vector_store.py
─────────────────────────────
A project's search chunks, in Postgres (table context_chunks, see
app/models/search_index.py). Same functions and return shapes as when this
was a ChromaDB collection per project, so the pipeline didn't change.

Called from worker threads (asyncio.to_thread), so it uses its own small
synchronous engine (app/core/rag/index_db.py), not the request's session.

Similarity is an exact scan of one project's chunks (no HNSW index): with an
approximate index Postgres may fetch the nearest chunks across ALL projects
and only then filter to this one, returning fewer than asked for. At a few
thousand chunks per project the exact scan takes milliseconds, and it is
never less accurate than ChromaDB's HNSW. Add an index (and iterative
scans) when projects grow far beyond that.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from app.core.logging import get_logger
from app.core.rag import index_db
from app.db import base as _base  # noqa: F401  (before app.models: importing a model first is a circular import)
from app.models.search_index import ContextChunk, ProjectVocabulary

logger = get_logger(__name__)

_chunks = ContextChunk.__table__


def _uuid(value: str | uuid.UUID) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def upsert_chunks(project_id: str, chunks: list[dict[str, Any]]) -> None:
    """Insert or update embedding chunks for a project."""
    if not chunks:
        return
    pid = _uuid(project_id)
    rows = [
        {
            "id": c["id"],
            "project_id": pid,
            "context_id": _uuid(c["metadata"]["context_id"]),
            "text": c["text"],
            "metadata": c["metadata"],
            "embedding": [float(x) for x in c["embedding"]],
        }
        for c in chunks
    ]
    stmt = insert(_chunks).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[_chunks.c.id],
        set_={
            "project_id": stmt.excluded.project_id,
            "context_id": stmt.excluded.context_id,
            "text": stmt.excluded.text,
            "metadata": stmt.excluded.metadata,
            "embedding": stmt.excluded.embedding,
        },
    )
    with index_db.engine().begin() as conn:
        conn.execute(stmt)


def retrieve(project_id: str, query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """Return top_k semantically similar chunks for a query embedding."""
    distance = _chunks.c.embedding.cosine_distance([float(x) for x in query_embedding]).label("distance")
    query = (
        select(_chunks.c.id, _chunks.c.text, _chunks.c.metadata, distance)
        .where(_chunks.c.project_id == _uuid(project_id))
        .order_by(distance, _chunks.c.seq)
        .limit(top_k)
    )
    with index_db.engine().connect() as conn:
        rows = conn.execute(query).all()
    return [
        {
            "chunk_id": row.id,
            # Same score as with ChromaDB: 1 / (1 + cosine distance).
            "score": float(1.0 / (1.0 + row.distance)),
            "rank": rank,
            "text": row.text,
            "metadata": row.metadata,
        }
        for rank, row in enumerate(rows, start=1)
    ]


def get_all_chunks(project_id: str) -> list[dict]:
    """Fetch all stored chunks for a project (used to build the BM25 index at query time),
    in the order they were first stored."""
    query = (
        select(_chunks.c.id, _chunks.c.text, _chunks.c.metadata)
        .where(_chunks.c.project_id == _uuid(project_id))
        .order_by(_chunks.c.seq)
    )
    with index_db.engine().connect() as conn:
        rows = conn.execute(query).all()
    return [{"chunk_id": row.id, "text": row.text, "metadata": row.metadata} for row in rows]


def chunk_count(project_id: str) -> int:
    query = select(func.count()).select_from(_chunks).where(_chunks.c.project_id == _uuid(project_id))
    with index_db.engine().connect() as conn:
        return int(conn.execute(query).scalar_one())


def delete_context_chunks(project_id: str, context_id: str) -> None:
    """Removes every chunk belonging to one captured context. Called when a
    note is trashed or deleted, so it leaves search and Ask AI too. Best-effort:
    a hiccup here shouldn't block the delete of the row itself, which is what
    the user is waiting on (the trash purge sweeps up leftovers)."""
    try:
        with index_db.engine().begin() as conn:
            conn.execute(
                delete(_chunks).where(
                    _chunks.c.project_id == _uuid(project_id), _chunks.c.context_id == _uuid(context_id)
                )
            )
    except Exception:
        logger.warning("vector_delete_failed", project_id=project_id, context_id=context_id, exc_info=True)


def delete_project_collection(project_id: str) -> None:
    """Removes all of a project's chunks when the project is deleted, so its
    notes' text doesn't outlive it. Best-effort, like delete_context_chunks."""
    try:
        with index_db.engine().begin() as conn:
            conn.execute(delete(_chunks).where(_chunks.c.project_id == _uuid(project_id)))
        logger.info("vector_collection_deleted", project_id=project_id)
    except Exception:
        logger.warning("vector_collection_delete_failed", project_id=project_id, exc_info=True)


def delete_orphans(older_than: timedelta = timedelta(hours=1)) -> int:
    """Removes chunks whose note no longer exists, and vocabularies whose
    project no longer exists: left behind when a best-effort delete failed, or
    a capture was indexed and its request then rolled back. Only rows older
    than `older_than`, so a capture whose request hasn't committed yet keeps
    its chunks. Returns how many chunks went. Run by the trash purge."""
    from app.models.context import Context
    from app.models.project import Project

    cutoff = datetime.now(timezone.utc) - older_than
    contexts = Context.__table__
    projects = Project.__table__
    vocab = ProjectVocabulary.__table__
    with index_db.engine().begin() as conn:
        removed = conn.execute(
            delete(_chunks).where(
                _chunks.c.created_at < cutoff,
                ~select(contexts.c.id).where(contexts.c.id == _chunks.c.context_id).exists(),
            )
        ).rowcount
        conn.execute(
            delete(vocab).where(
                vocab.c.updated_at < cutoff,
                ~select(projects.c.id).where(projects.c.id == vocab.c.project_id).exists(),
            )
        )
    if removed:
        logger.info("vector_orphans_deleted", chunks=removed)
    return removed
