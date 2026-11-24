"""Add notebook/note fields to contexts.

Adds content_md, source, page_title, prompt_text, user_note, kind,
updated_at, chapter_id to `contexts`. These turn every captured/written
context into a first-class "passage" for the notebook reading view,
instead of the notes UI having to dig into raw_content JSONB on every read.

Backfill (best-effort, since none of these were tracked before this
migration):
  - content_md  <- joined raw_content.messages[].content
  - source      <- platform (if a real AI platform), else inferred from
                   chat_url's hostname (covers historical platform="note" rows)
  - kind        <- "written" only when metadata.source == "dashboard-note"
                   (the one case we can positively identify); everything
                   else defaults to "captured", the more common case
  - updated_at  <- created_at

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-21 00:00:00.000000
"""

from typing import Sequence, Union
from urllib.parse import urlparse

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_PLATFORM_HOST_PATTERNS: dict[str, tuple[str, ...]] = {
    "chatgpt": ("chatgpt.com", "chat.openai.com"),
    "claude": ("claude.ai",),
    "gemini": ("gemini.google.com",),
    "perplexity": ("perplexity.ai",),
}


def _infer_source(chat_url: str | None) -> str | None:
    if not chat_url:
        return None
    host = (urlparse(chat_url).hostname or "").lower()
    for platform, patterns in _PLATFORM_HOST_PATTERNS.items():
        if any(host == p or host.endswith(f".{p}") for p in patterns):
            return platform
    return None


def upgrade() -> None:
    op.add_column("contexts", sa.Column("content_md", sa.Text(), nullable=True))
    op.add_column("contexts", sa.Column("source", sa.String(32), nullable=True))
    op.add_column("contexts", sa.Column("page_title", sa.String(512), nullable=True))
    op.add_column("contexts", sa.Column("prompt_text", sa.Text(), nullable=True))
    op.add_column("contexts", sa.Column("user_note", sa.Text(), nullable=True))
    op.add_column("contexts", sa.Column("kind", sa.String(16), nullable=True))
    op.add_column("contexts", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("contexts", sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=True))

    op.create_index("ix_contexts_source", "contexts", ["source"])
    op.create_index("ix_contexts_kind", "contexts", ["kind"])
    op.create_index("ix_contexts_chapter_id", "contexts", ["chapter_id"])

    conn = op.get_bind()
    rows = conn.execute(
        sa.text('SELECT id, raw_content, platform, chat_url, metadata FROM contexts')
    ).fetchall()

    for row in rows:
        messages = (row.raw_content or {}).get("messages") or []
        content_md = "\n\n".join(
            m.get("content", "") for m in messages if isinstance(m, dict) and m.get("content")
        ).strip() or None

        if row.platform and row.platform not in ("note", "unknown"):
            source = row.platform
        else:
            source = _infer_source(row.chat_url)

        metadata = row.metadata or {}
        kind = "written" if metadata.get("source") == "dashboard-note" else "captured"

        conn.execute(
            sa.text(
                "UPDATE contexts SET content_md = :content_md, source = :source, "
                "kind = :kind, updated_at = created_at WHERE id = :id"
            ),
            {"content_md": content_md, "source": source, "kind": kind, "id": row.id},
        )

    # Now safe to tighten kind/updated_at to NOT NULL (every row backfilled above).
    op.alter_column("contexts", "kind", nullable=False, server_default="captured")
    op.alter_column("contexts", "updated_at", nullable=False, server_default=sa.func.now())


def downgrade() -> None:
    op.drop_index("ix_contexts_chapter_id", table_name="contexts")
    op.drop_index("ix_contexts_kind", table_name="contexts")
    op.drop_index("ix_contexts_source", table_name="contexts")
    op.drop_column("contexts", "chapter_id")
    op.drop_column("contexts", "updated_at")
    op.drop_column("contexts", "kind")
    op.drop_column("contexts", "user_note")
    op.drop_column("contexts", "prompt_text")
    op.drop_column("contexts", "page_title")
    op.drop_column("contexts", "source")
    op.drop_column("contexts", "content_md")
