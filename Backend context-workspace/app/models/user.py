"""
app/models/user.py
────────────────────
User — an authenticated account. Owns projects (see Project.user_id).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.project import Project


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    # Normalized (lowercased + stripped) before every save — see
    # app/services/auth.py::_normalize_email. Uniqueness is enforced at the
    # DB level on this already-normalized value, not on whatever casing a
    # client happens to send.
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Relationships ────────────────────────────────────────────────────────
    projects: Mapped[list["Project"]] = relationship(
        "Project",
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="noload",  # always explicit; avoids N+1 queries — matches Project.sessions
    )

    def __repr__(self) -> str:
        return f"<User id={self.id!s} email={self.email!r}>"
