"""
app/models/project.py
──────────────────────
Project — top-level container for all AI sessions and captured contexts.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.session import Session
    from app.models.user import User


class Project(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Ownership boundary for the whole Project → Session → Context tree, and
    # the ChromaDB collection scoped to this project_id — see
    # app/services/project.py::get_project for where this is enforced.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Relationships ────────────────────────────────────────────────────────
    owner: Mapped["User"] = relationship("User", back_populates="projects", lazy="noload")
    sessions: Mapped[list["Session"]] = relationship(
        "Session",
        back_populates="project",
        cascade="all, delete-orphan",
        lazy="noload",  # always explicit; avoids N+1 queries
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id!s} name={self.name!r}>"
