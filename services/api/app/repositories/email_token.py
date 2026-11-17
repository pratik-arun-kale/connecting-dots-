"""
app/repositories/email_token.py
─────────────────────────────────
EmailTokenRepository – data access for single-use email link tokens.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.models.email_token import EmailToken
from app.repositories.base import BaseRepository


class EmailTokenRepository(BaseRepository[EmailToken]):
    model = EmailToken

    async def get_by_hash(self, token_hash: str) -> EmailToken | None:
        result = await self.session.execute(select(EmailToken).where(EmailToken.token_hash == token_hash))
        return result.scalar_one_or_none()

    async def use_all_for_user(self, user_id: uuid.UUID, purpose: str) -> None:
        """Mark every unused token of this purpose as used, so only the
        newest link works (and none does after a successful reset)."""
        await self.session.execute(
            update(EmailToken)
            .where(EmailToken.user_id == user_id, EmailToken.purpose == purpose, EmailToken.used_at.is_(None))
            .values(used_at=datetime.now(timezone.utc))
        )
        await self.session.flush()
