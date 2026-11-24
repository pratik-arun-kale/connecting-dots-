"""
app/models/search_index.py
───────────────────────────
The search index, in Postgres (it used to be ChromaDB and JSON files on the
API's local disk, which Cloud Run wipes on every restart).

  context_chunks      one row per chunk: its text, metadata and embedding
  project_vocabulary  each project's learned vocabulary (app/core/rag/vocabulary.py)

Written and read by app/core/rag/vector_store.py and vocabulary.py through
their own short connections, from worker threads.

No foreign keys, deliberately: a new capture is indexed inside its request,
before that request commits, so a chunk's context row isn't visible yet to the
connection writing the chunk. Deletes are explicit, as they were with ChromaDB
(trashing a note, deleting a project, the trash purge), and the purge also
sweeps chunks whose note no longer exists (vector_store.delete_orphans).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, DateTime, Identity, Index, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# all-MiniLM-L6-v2 (app/core/rag/model_specs.py) produces 384 numbers per text.
EMBEDDING_DIM = 384


class ContextChunk(Base):
    __tablename__ = "context_chunks"
    __table_args__ = (
        Index("ix_context_chunks_project_seq", "project_id", "seq"),
        Index("ix_context_chunks_context", "context_id"),
    )

    # The chunker's id: <context>__m<i>__c<j>.
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    # Insertion order. Chunks are always read back in this order, as ChromaDB
    # returned them, so BM25 (built from them per query) breaks ties the same way.
    seq: Mapped[int] = mapped_column(BigInteger, Identity(always=False), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    context_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProjectVocabulary(Base):
    __tablename__ = "project_vocabulary"

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    # The dict vocabulary.py used to write to data/vocabulary/<project>.json.
    entries: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
