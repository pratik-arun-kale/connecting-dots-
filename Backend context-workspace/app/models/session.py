"""
app/models/session.py
──────────────────────
Session — a single AI interaction captured from a source platform.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.context import Context
    from app.models.project import Project


class SourcePlatform:
    """Allowed values for Session.source_platform. Kept as a plain class
    (not Enum) so adding new platforms later is a migration-free operation
    — just update this list and update frontend dropdowns."""

    CHATGPT = "chatgpt"
    CLAUDE = "claude"
    GEMINI = "gemini"
    DOCS = "docs"
    UNKNOWN = "unknown"

    ALL = {CHATGPT, CLAUDE, GEMINI, DOCS, UNKNOWN}


class LinkStatus:
    """Lifecycle of the session↔tab URL binding."""

    PENDING = "pending"    # session created; no live tab URL yet
    LINKED = "linked"      # tab URL confirmed and stored
    UNLINKED = "unlinked"  # was linked; tab closed (reserved for future use)


class Session(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "sessions"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_platform: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=SourcePlatform.UNKNOWN,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tab_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    linked_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    link_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=LinkStatus.PENDING,
        index=True,
    )
    linked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ── Relationships ────────────────────────────────────────────────────────
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="sessions",
        lazy="noload",
    )
    contexts: Mapped[list["Context"]] = relationship(
        "Context",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    def __repr__(self) -> str:
        return (
            f"<Session id={self.id!s} platform={self.source_platform!r}"
            f" project_id={self.project_id!s}>"
        )
