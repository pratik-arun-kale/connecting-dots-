"""
app/repositories/auth_session.py
───────────────────────────────────
AuthSessionRepository – data-access layer for the AuthSession (refresh
token) model.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.models.auth_session import AuthSession
from app.repositories.base import BaseRepository


class AuthSessionRepository(BaseRepository[AuthSession]):
    model = AuthSession

    async def get_by_refresh_token_hash(self, token_hash: str) -> AuthSession | None:
        result = await self.session.execute(
            select(AuthSession).where(AuthSession.refresh_token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def revoke(self, auth_session: AuthSession) -> AuthSession:
        return await self.update(auth_session, revoked_at=datetime.now(timezone.utc))

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        """Bulk revoke — used by logout-all and by refresh-token-reuse detection."""
        await self.session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await self.session.flush()

    async def touch_last_used(self, auth_session: AuthSession) -> AuthSession:
        return await self.update(auth_session, last_used_at=datetime.now(timezone.utc))
