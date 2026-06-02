"""Add capture-specific fields to contexts table and perplexity platform support.

Adds idempotency_key (for dedup), title, messages_count, platform, chat_url
to contexts. These promote the most-queried fields out of JSONB for performance.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-02 18:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("contexts", sa.Column("idempotency_key", sa.String(64), nullable=True))
    op.add_column("contexts", sa.Column("title", sa.String(512), nullable=True))
    op.add_column("contexts", sa.Column("messages_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("contexts", sa.Column("platform", sa.String(32), nullable=True))
    op.add_column("contexts", sa.Column("chat_url", sa.String(2048), nullable=True))

    # Partial unique index: NULLs are distinct in PG, but we only care about
    # non-null keys. The WHERE clause enforces uniqueness only where it matters.
    op.create_index(
        "ix_contexts_idempotency_key",
        "contexts",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.create_index("ix_contexts_platform", "contexts", ["platform"])
    op.create_index("ix_contexts_chat_url",  "contexts", ["chat_url"])


def downgrade() -> None:
    op.drop_index("ix_contexts_chat_url",       table_name="contexts")
    op.drop_index("ix_contexts_platform",        table_name="contexts")
    op.drop_index("ix_contexts_idempotency_key", table_name="contexts")
    op.drop_column("contexts", "chat_url")
    op.drop_column("contexts", "platform")
    op.drop_column("contexts", "messages_count")
    op.drop_column("contexts", "title")
    op.drop_column("contexts", "idempotency_key")
