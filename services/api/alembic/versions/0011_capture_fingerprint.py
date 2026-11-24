"""contexts.content_hash: one copy of each captured passage or conversation per project.

Backfills existing captured rows. Where duplicates already exist, only the
oldest copy gets the hash (the rest stay, unhashed, so nothing is deleted).
Written notes are never hashed: writing the same text twice is allowed.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-17 00:00:00.000000
"""

import hashlib
from collections.abc import Sequence
from urllib.parse import urldefrag

import sqlalchemy as sa

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _fingerprint(project_id: str, chat_url: str | None, content_md: str | None) -> str | None:
    # Frozen copy of app.core.fingerprint.capture_fingerprint at this revision.
    text = " ".join((content_md or "").split())
    if not text:
        return None
    url = urldefrag((chat_url or "").strip())[0]
    return hashlib.sha256(f"{project_id}\n{url}\n{text}".encode()).hexdigest()


def upgrade() -> None:
    op.add_column("contexts", sa.Column("content_hash", sa.String(64), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT c.id, s.project_id, c.chat_url, c.content_md FROM contexts c "
            "JOIN sessions s ON s.id = c.session_id "
            "WHERE c.kind = 'captured' ORDER BY c.created_at, c.id"
        )
    ).all()
    seen: set[str] = set()
    for row in rows:
        digest = _fingerprint(str(row.project_id), row.chat_url, row.content_md)
        if digest is None or digest in seen:
            continue
        seen.add(digest)
        bind.execute(sa.text("UPDATE contexts SET content_hash = :h WHERE id = :id"), {"h": digest, "id": row.id})

    op.create_index("ix_contexts_content_hash", "contexts", ["content_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_contexts_content_hash", table_name="contexts")
    op.drop_column("contexts", "content_hash")
