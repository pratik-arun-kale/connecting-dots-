"""
app/models/session.py
──────────────────────
Session — a single AI provider session tied to a project.
Lifecycle is owned by the Chrome extension; backend is the source of truth.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.context import Context
    from app.models.project import Project


class SourcePlatform:
    """Allowed values for Session.source_platform."""

    CHATGPT = "chatgpt"
    CLAUDE  = "claude"
    GEMINI  = "gemini"
    UNKNOWN = "unknown"

    ALL = {CHATGPT, CLAUDE, GEMINI, UNKNOWN}


class SessionState:
    """Deterministic FSM states driven by the Chrome extension."""

    PENDING              = "pending"               # created; extension not yet driving
    CREATING_TAB         = "creating_tab"
    WAITING_FOR_UI       = "waiting_for_ui"
    INJECTING_BOOTSTRAP  = "injecting_bootstrap"
    WAITING_FOR_URL      = "waiting_for_url"
    LINKING              = "linking"               # PATCH /link in-flight
    COMPLETED            = "completed"
    FAILED               = "failed"

    TERMINAL = {COMPLETED, FAILED}
    ACTIVE   = {CREATING_TAB, WAITING_FOR_UI, INJECTING_BOOTSTRAP, WAITING_FOR_URL, LINKING}

    # Valid FSM transitions (from → frozenset of allowed next states)
    TRANSITIONS: dict[str, frozenset[str]] = {
        PENDING:             frozenset({CREATING_TAB, FAILED}),
        CREATING_TAB:        frozenset({WAITING_FOR_UI, FAILED}),
        WAITING_FOR_UI:      frozenset({INJECTING_BOOTSTRAP, FAILED}),
        INJECTING_BOOTSTRAP: frozenset({WAITING_FOR_URL, FAILED}),
        WAITING_FOR_URL:     frozenset({LINKING, FAILED}),
        LINKING:             frozenset({COMPLETED, FAILED}),
    }


class LinkStatus:
    """Legacy link_status values kept for backward compatibility."""

    PENDING  = "pending"
    LINKED   = "linked"
    UNLINKED = "unlinked"
    FAILED   = "failed"


class Session(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "sessions"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_platform: Mapped[str] = mapped_column(
        String(50), nullable=False, default=SourcePlatform.UNKNOWN, index=True
    )
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Lifecycle ────────────────────────────────────────────────────────────
    session_state: Mapped[str] = mapped_column(
        String(30), nullable=False, default=SessionState.PENDING, index=True
    )
    bootstrap_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Link result ──────────────────────────────────────────────────────────
    tab_url:    Mapped[str | None]      = mapped_column(String(2048), nullable=True)
    linked_url: Mapped[str | None]      = mapped_column(String(2048), nullable=True)
    link_status: Mapped[str]            = mapped_column(String(20), nullable=False, default=LinkStatus.PENDING, index=True)
    linked_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Failure ──────────────────────────────────────────────────────────────
    failed_at:      Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_reason: Mapped[str | None]      = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ────────────────────────────────────────────────────────
    project: Mapped["Project"] = relationship("Project", back_populates="sessions", lazy="noload")
    contexts: Mapped[list["Context"]] = relationship(
        "Context", back_populates="session", cascade="all, delete-orphan", lazy="noload"
    )

    def __repr__(self) -> str:
        return (
            f"<Session id={self.id!s} platform={self.source_platform!r}"
            f" state={self.session_state!r} project={self.project_id!s}>"
        )
