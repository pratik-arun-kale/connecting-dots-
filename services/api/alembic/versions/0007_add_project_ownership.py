"""Add project ownership (projects.user_id)

Adds the ownership column that closes the cross-user IDOR the security audit
found (every project/session/context/search/query endpoint previously
trusted a client-supplied id with no owner check at all).

Backward compatibility: projects created before auth existed have no owner.
Per an explicit decision (not a silent default), this migration creates one
bootstrapped admin user — from ADMIN_EMAIL/ADMIN_PASSWORD (falling back to
admin@example.com / a freshly generated random password, logged ONCE to the
migration's stdout so it isn't silently lost) — and assigns every currently-
orphaned project to them, in the same transaction as adding the column, so
the column can safely become NOT NULL by the time this migration finishes.
This is a one-time bootstrap: re-running this migration (or running it
again on a database where it already ran) is idempotent — it reuses the
existing admin user by email rather than creating a duplicate.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-30 00:05:00.000000
"""

import secrets
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # 1. Add the column nullable first — existing rows must not break.
    op.add_column("projects", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))

    conn = op.get_bind()
    orphaned = conn.execute(sa.text("SELECT count(*) FROM projects WHERE user_id IS NULL")).scalar_one()

    if orphaned > 0:
        # Imported lazily (only when there's actually legacy data to
        # backfill) so a fresh database with no pre-auth projects never
        # needs argon2 available at migration time.
        from app.core.security import hash_password
        from app.core.settings import settings

        # "admin@localhost" is NOT used as the fallback: it fails EmailStr
        # validation on the login endpoint itself (no TLD dot), which would
        # make a fallback-bootstrapped admin permanently unable to log in.
        admin_email = (settings.admin_email or "admin@example.com").strip().lower()
        existing_admin = conn.execute(
            sa.text("SELECT id FROM users WHERE email = :email"), {"email": admin_email}
        ).scalar_one_or_none()

        if existing_admin is not None:
            admin_id = existing_admin
        else:
            admin_id = uuid.uuid4()
            admin_password = settings.admin_password or secrets.token_urlsafe(24)
            conn.execute(
                sa.text(
                    "INSERT INTO users (id, email, password_hash, is_active) "
                    "VALUES (:id, :email, :password_hash, true)"
                ),
                {
                    "id": admin_id,
                    "email": admin_email,
                    "password_hash": hash_password(admin_password),
                },
            )
            if not settings.admin_password:
                # Only reachable when no ADMIN_PASSWORD was configured — the
                # generated password is otherwise unrecoverable, so it MUST
                # be surfaced here rather than silently discarded.
                print(
                    f"\n[0007_add_project_ownership] Created admin user {admin_email!r} "
                    f"with generated password: {admin_password}\n"
                    "Log in and change it immediately — this will not be shown again.\n"
                )

        conn.execute(
            sa.text("UPDATE projects SET user_id = :admin_id WHERE user_id IS NULL"),
            {"admin_id": admin_id},
        )

    # 2. Now safe to enforce NOT NULL + the FK + index.
    op.alter_column("projects", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_projects_user_id_users", "projects", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_projects_user_id", table_name="projects")
    op.drop_constraint("fk_projects_user_id_users", "projects", type_="foreignkey")
    op.drop_column("projects", "user_id")
