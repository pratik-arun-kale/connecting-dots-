"""contexts.indexed_version: which version of a context the search index holds.

Indexing used to run in FastAPI background tasks after the response was
sent, which a serverless host (Cloud Run) may never give CPU to. Now a new
capture is indexed inside its request, and an edit (which bumps `version`)
just leaves `indexed_version` behind; search and Ask AI bring a project's
stale contexts up to date before they run. NULL means "never indexed":
those are retried on the next search.

Existing rows are assumed indexed (the old background re-index kept up), so
the first search after this migration doesn't re-embed every note.

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-24 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("contexts", sa.Column("indexed_version", sa.Integer(), nullable=True))
    # Assigning updated_at to itself keeps the column's onupdate out of it, so
    # notes keep their "last edited" order.
    op.execute("UPDATE contexts SET indexed_version = version, updated_at = updated_at")


def downgrade() -> None:
    op.drop_column("contexts", "indexed_version")
