"""
app/models/project.py
──────────────────────
Project — top-level container for all AI sessions and captured contexts.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.session import Session


class Project(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationships ────────────────────────────────────────────────────────
    sessions: Mapped[list["Session"]] = relationship(
        "Session",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="noload",  # always explicit; avoids N+1 queries
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id!s} name={self.name!r}>"
