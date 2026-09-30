"""Add contexts.user_title — a reader-set title, separate from the automatic one.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-30 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("contexts", sa.Column("user_title", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("contexts", "user_title")
