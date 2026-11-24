"""add tab_url to sessions

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-24 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("tab_url", sa.String(2048), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "tab_url")
