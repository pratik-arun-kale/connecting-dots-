"""Add session lifecycle columns (session_state, bootstrap_message, failure tracking)

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-25 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column(
            "session_state",
            sa.String(30),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column("sessions", sa.Column("bootstrap_message", sa.Text, nullable=True))
    op.add_column(
        "sessions",
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "sessions",
        sa.Column("failure_reason", sa.String(100), nullable=True),
    )
    op.add_column(
        "sessions",
        sa.Column(
            "attempt",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
    )

    op.create_index("ix_sessions_session_state", "sessions", ["session_state"])

    # Partial unique index: one active (non-terminal) session per provider per project.
    # Prevents the extension from creating duplicate sessions for the same provider.
    op.execute(
        """
        CREATE UNIQUE INDEX uq_sessions_project_provider_active
        ON sessions (project_id, source_platform)
        WHERE session_state NOT IN ('completed', 'failed')
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_sessions_project_provider_active")
    op.drop_index("ix_sessions_session_state", table_name="sessions")
    op.drop_column("sessions", "attempt")
    op.drop_column("sessions", "failure_reason")
    op.drop_column("sessions", "failed_at")
    op.drop_column("sessions", "bootstrap_message")
    op.drop_column("sessions", "session_state")
