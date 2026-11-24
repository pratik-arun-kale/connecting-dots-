"""auth_sessions.rotated_at and replaced_by_id: a short grace period for a
refresh token that was just rotated.

Two tabs (or the extension's popup and worker) refreshing with the same
token at the same moment used to look like token theft: the second request
revoked every session the user had. Now a token rotated in the last
AUTH_REFRESH_GRACE_SEC seconds may be traded once more, provided the session
that replaced it is still live (no logout, logout-everywhere or password
reset in between). Later reuse still revokes everything.

Existing rows get NULLs: tokens rotated before this migration have no grace.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-24 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("auth_sessions", sa.Column("replaced_by_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_auth_sessions_replaced_by_id",
        "auth_sessions",
        "auth_sessions",
        ["replaced_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_auth_sessions_replaced_by_id", "auth_sessions", type_="foreignkey")
    op.drop_column("auth_sessions", "replaced_by_id")
    op.drop_column("auth_sessions", "rotated_at")
