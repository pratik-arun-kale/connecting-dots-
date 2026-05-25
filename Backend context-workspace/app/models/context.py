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

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
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

    # ── Content columns ──────────────────────────────────────────────────────
    # raw_content  : required — the original, unprocessed payload from the
    #                capture source (Chrome extension, pasted text, API dump…)
    # structured_content : optional — populated asynchronously by AI pipeline
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

    # ── Relationships ────────────────────────────────────────────────────────
    session: Mapped["Session"] = relationship(
        "Session",
        back_populates="contexts",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return f"<Context id={self.id!s} session_id={self.session_id!s}>"
