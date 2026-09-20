"""
app/models/context.py
──────────────────────
Context — a single unit of captured AI content linked to a Session.

JSONB columns:
  raw_content        – always present; verbatim captured payload
  structured_content – optional; populated by AI extraction pipeline later
  tags               – optional; free-form label list for search / filter
  metadata           – optional; arbitrary key-value extension point
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.session import Session


class Context(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "contexts"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Capture-specific columns ─────────────────────────────────────────────
    # Promoted out of JSONB for efficient querying and deduplication.
    idempotency_key: Mapped[str | None] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )
    title: Mapped[str | None]    = mapped_column(String(512), nullable=True)
    messages_count: Mapped[int]  = mapped_column(Integer, nullable=False, default=0)
    platform: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    chat_url: Mapped[str | None] = mapped_column(String(2048), nullable=True, index=True)

    # ── Notebook fields (0008) ───────────────────────────────────────────────
    # content_md: the canonical passage body, plain-Markdown (Turndown output
    # for extension captures) — computed server-side at capture time from
    # raw_content.messages, never trusted verbatim from the client.
    content_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    # source: the actual AI platform content came FROM (chatgpt/claude/gemini/
    # perplexity) — distinct from `platform`, which is "note"/"unknown" for
    # manually-captured notes and would otherwise hide which site a note was
    # taken from. Inferred server-side from chat_url's hostname, not
    # client-supplied (see ContextService._infer_source).
    source: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    page_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # prompt_text: the user's question that preceded a captured answer, when
    # the extension could find it (best-effort DOM lookup — often null).
    prompt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # user_note: the reader's own annotation on a captured passage, added
    # after the fact via PATCH — distinct from a "written" note's own body.
    user_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # kind: "captured" (a highlighted passage from an AI chat, or a full
    # conversation capture) vs "written" (composed directly by the user,
    # via the extension launcher's manual note or the dashboard composer).
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="captured", index=True)
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )  # populated by the Phase 3 clustering job; no FK yet (chapters table doesn't exist)

    # ── Content columns ──────────────────────────────────────────────────────
    raw_content: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False
    )
    structured_content: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )

    # ── Metadata columns ─────────────────────────────────────────────────────
    tags: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSONB, nullable=True  # column name kept simple in DB
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── Relationships ────────────────────────────────────────────────────────
    session: Mapped["Session"] = relationship(
        "Session",
        back_populates="contexts",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return f"<Context id={self.id!s} session_id={self.session_id!s}>"
