"""add linked_url, link_status, linked_at to sessions

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-25 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("linked_url", sa.String(2048), nullable=True))
    op.add_column(
        "sessions",
        sa.Column(
            "link_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "sessions",
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sessions_link_status", "sessions", ["link_status"])


def downgrade() -> None:
    op.drop_index("ix_sessions_link_status", table_name="sessions")
    op.drop_column("sessions", "linked_at")
    op.drop_column("sessions", "link_status")
    op.drop_column("sessions", "linked_url")
