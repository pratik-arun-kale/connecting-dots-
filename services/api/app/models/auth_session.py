"""
app/models/auth_session.py
────────────────────────────
AuthSession — one issued refresh token, tracked server-side so it can be
revoked. Named "auth_sessions" (not "sessions") deliberately: "Session" is
already the AI-provider capture-session concept in app/models/session.py —
a completely different thing. Never confuse the two.

Only the SHA-256 hash of the refresh token is stored (see
app/core/security.py) — never the raw token, so a stolen row in this table
cannot be used as a credential on its own.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuthSession(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "auth_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set (with revoked_at) when this token was traded for a new one, as
    # opposed to a logout. For settings.auth_refresh_grace_sec afterwards the
    # same token may be traded again (a second tab that refreshed at the same
    # moment), as long as `replaced_by_id` is still live; see AuthService.refresh.
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth_sessions.id", ondelete="SET NULL"), nullable=True
    )

    user: Mapped[User] = relationship("User", lazy="noload")

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > _utcnow()

    def __repr__(self) -> str:
        return f"<AuthSession id={self.id!s} user_id={self.user_id!s} revoked={self.revoked_at is not None}>"
