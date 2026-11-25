"""The search index moves into Postgres: context_chunks and project_vocabulary.

ChromaDB (data/chromadb/) and the vocabulary JSON files (data/vocabulary/)
lived on the API's local disk, which Cloud Run keeps in memory and wipes on
every restart. Every context is marked "not indexed": each project's next
search fills its part of the new tables, or run scripts/rebuild_search_index.py
to fill them all at once.

No foreign keys and no HNSW index, on purpose; see app/models/search_index.py
and app/core/rag/vector_store.py.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-24 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "context_chunks",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("seq", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("context_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=False),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_context_chunks_project_seq", "context_chunks", ["project_id", "seq"])
    op.create_index("ix_context_chunks_context", "context_chunks", ["context_id"])
    op.create_table(
        "project_vocabulary",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("entries", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    # The new index starts empty: mark every context "not indexed", so each
    # project's next search or Ask AI question indexes it (ContextService.
    # bring_index_up_to_date), even if scripts/rebuild_search_index.py is never run.
    op.execute("UPDATE contexts SET indexed_version = NULL, updated_at = updated_at")


def downgrade() -> None:
    op.drop_table("project_vocabulary")
    op.drop_index("ix_context_chunks_context", table_name="context_chunks")
    op.drop_index("ix_context_chunks_project_seq", table_name="context_chunks")
    op.drop_table("context_chunks")
    # The extension stays: dropping it could break anything else using it.
