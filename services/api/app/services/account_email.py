"""
app/services/account_email.py
───────────────────────────────
Email verification and password reset: issuing and redeeming the
single-use tokens behind the links. Sending is the route's job (in a
background task, see app/services/email.py); this service never sends and
never logs a raw token.

Rules:
  - A token is 256 random bits; only its SHA-256 hash is stored.
  - Each works once, until it expires, for one purpose.
  - Issuing a new token of a purpose voids the user's older unused ones,
    so only the newest link in the inbox works.
  - A password reset also verifies the email (the link proved ownership),
    voids every other reset link, and signs the user out everywhere.
  - Every invalid, used, expired or wrong-purpose token gets the same error.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnprocessableException
from app.core.logging import get_logger
from app.core.security import hash_password_async, hash_refresh_token
from app.core.settings import settings
from app.models.email_token import EmailTokenPurpose
from app.models.user import User
from app.repositories.auth_session import AuthSessionRepository
from app.repositories.email_token import EmailTokenRepository
from app.repositories.user import UserRepository

logger = get_logger(__name__)

INVALID_LINK = "This link is invalid or has expired. Ask for a new one."


def _hash(raw: str) -> str:
    # Same fast SHA-256 as refresh tokens: the input is 256 random bits, so a
    # slow KDF would protect nothing.
    return hash_refresh_token(raw)


class AccountEmailService:
    def __init__(self, db: AsyncSession) -> None:
        self._users = UserRepository(db)
        self._tokens = EmailTokenRepository(db)
        self._auth_sessions = AuthSessionRepository(db)

    async def _issue(self, user: User, purpose: str, lifetime: timedelta) -> str:
        await self._tokens.use_all_for_user(user.id, purpose)
        raw = secrets.token_urlsafe(32)
        await self._tokens.create(
            user_id=user.id,
            purpose=purpose,
            token_hash=_hash(raw),
            expires_at=datetime.now(timezone.utc) + lifetime,
        )
        return raw

    async def _redeem(self, raw: str, purpose: str) -> User:
        token = await self._tokens.get_by_hash(_hash(raw)) if raw else None
        now = datetime.now(timezone.utc)
        if token is None or token.purpose != purpose or token.used_at is not None or token.expires_at <= now:
            raise UnprocessableException(INVALID_LINK)
        user = await self._users.get_by_id(token.user_id)
        if user is None or not user.is_active:
            raise UnprocessableException(INVALID_LINK)
        await self._tokens.update(token, used_at=now)
        return user

    # ── Verification ──────────────────────────────────────────────────────────

    async def issue_verification(self, user: User) -> str | None:
        """A raw token to email, or None if the address is already verified."""
        if user.email_verified_at is not None:
            return None
        return await self._issue(
            user, EmailTokenPurpose.VERIFY_EMAIL, timedelta(hours=settings.email_verify_token_hours)
        )

    async def confirm_email(self, raw: str) -> User:
        user = await self._redeem(raw, EmailTokenPurpose.VERIFY_EMAIL)
        if user.email_verified_at is None:
            user = await self._users.update(user, email_verified_at=datetime.now(timezone.utc))
        logger.info("email_verified", user_id=str(user.id))
        return user

    # ── Password reset ────────────────────────────────────────────────────────

    async def issue_password_reset(self, email: str) -> tuple[User, str] | None:
        """(user, raw token) to email, or None for an unknown or deactivated
        address. The route answers the same either way."""
        user = await self._users.get_by_email(email.strip().lower())
        if user is None or not user.is_active:
            return None
        raw = await self._issue(
            user, EmailTokenPurpose.RESET_PASSWORD, timedelta(minutes=settings.password_reset_token_minutes)
        )
        logger.info("password_reset_requested", user_id=str(user.id))
        return user, raw

    async def reset_password(self, raw: str, new_password: str) -> User:
        user = await self._redeem(raw, EmailTokenPurpose.RESET_PASSWORD)
        now = datetime.now(timezone.utc)
        user = await self._users.update(
            user,
            password_hash=await hash_password_async(new_password),
            email_verified_at=user.email_verified_at or now,
        )
        await self._tokens.use_all_for_user(user.id, EmailTokenPurpose.RESET_PASSWORD)
        await self._auth_sessions.revoke_all_for_user(user.id)
        logger.info("password_reset", user_id=str(user.id))
        return user
