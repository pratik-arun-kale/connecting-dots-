"""Soft delete: projects.deleted_at and contexts.deleted_at (Trash, purged after 30 days).

The capture fingerprint stays unique only among live rows, so text that
was trashed can be captured again.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-17 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("projects", "contexts"):
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"])
    op.drop_index("ix_contexts_content_hash", table_name="contexts")
    op.create_index(
        "ix_contexts_content_hash", "contexts", ["content_hash"], unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    # Trashed rows would become live again; remove them instead (they were
    # going to be purged anyway).
    op.execute("DELETE FROM contexts WHERE deleted_at IS NOT NULL")
    op.execute("DELETE FROM projects WHERE deleted_at IS NOT NULL")
    op.drop_index("ix_contexts_content_hash", table_name="contexts")
    op.create_index("ix_contexts_content_hash", "contexts", ["content_hash"], unique=True)
    for table in ("projects", "contexts"):
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_column(table, "deleted_at")
