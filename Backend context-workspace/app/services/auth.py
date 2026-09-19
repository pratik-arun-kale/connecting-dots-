"""
app/services/auth.py
──────────────────────
AuthService – registration, login, token-pair issuance, refresh (with
rotation + reuse detection), and logout.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import ConflictException, ForbiddenException, UnauthorizedException
from app.core.logging import get_logger
from app.core.security import create_access_token, generate_refresh_token, hash_password, hash_refresh_token, verify_password
from app.core.settings import settings
from app.models.user import User
from app.repositories.auth_session import AuthSessionRepository
from app.repositories.user import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest

logger = get_logger(__name__)

# Precomputed once at import time so a login attempt against a nonexistent
# email still spends roughly the same time in verify_password() as one
# against a real user — otherwise response-time alone would reveal whether
# an email is registered (a user-enumeration side channel).
_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-constant-time-login")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


class AuthService:
    def __init__(
        self,
        db: AsyncSession,
        session_factory: Callable[[], AsyncSession] | async_sessionmaker[AsyncSession] | None = None,
    ) -> None:
        self._users = UserRepository(db)
        self._auth_sessions = AuthSessionRepository(db)
        # Used ONLY by the reuse-detection path below, which deliberately
        # commits from an INDEPENDENT session (see refresh()). If not given
        # explicitly, derive one from `db`'s own engine (`db.bind` — the
        # actual AsyncEngine the caller's session is already using) rather
        # than reaching for a separate global. This is what makes it work
        # correctly with zero extra wiring in both worlds: in production,
        # `db` is bound to the real app engine; in tests, it's bound to
        # whatever test engine the test fixture set up — so the derived
        # factory always targets the same database `db` itself does.
        self._fresh_session_factory = session_factory or async_sessionmaker(db.bind, expire_on_commit=False)

    # ── Registration ──────────────────────────────────────────────────────────

    async def register(self, payload: RegisterRequest) -> User:
        email = _normalize_email(payload.email)
        existing = await self._users.get_by_email(email)
        if existing is not None:
            raise ConflictException("An account with this email already exists.")

        user = await self._users.create(
            email=email,
            password_hash=hash_password(payload.password),
        )
        logger.info("user_registered", user_id=str(user.id))
        return user

    # ── Login ─────────────────────────────────────────────────────────────────

    async def authenticate(self, payload: LoginRequest) -> User:
        """Raises UnauthorizedException with a generic message on ANY
        failure (unknown email, wrong password) — never reveals which."""
        email = _normalize_email(payload.email)
        user = await self._users.get_by_email(email)

        if user is None:
            verify_password(payload.password, _DUMMY_PASSWORD_HASH)  # constant-time even for unknown emails
            raise UnauthorizedException("Invalid email or password.")

        if not verify_password(payload.password, user.password_hash):
            raise UnauthorizedException("Invalid email or password.")

        if not user.is_active:
            raise ForbiddenException("This account has been deactivated.")

        await self._users.update(user, last_login_at=datetime.now(timezone.utc))
        logger.info("user_login", user_id=str(user.id))
        return user

    # ── Token issuance / refresh / revocation ────────────────────────────────

    async def issue_token_pair(self, user: User) -> tuple[str, str]:
        """Returns (access_token, raw_refresh_token). The raw refresh token
        is returned to the caller exactly once — only its SHA-256 hash is
        ever persisted (see AuthSession.refresh_token_hash)."""
        access_token = create_access_token(user.id)
        raw_refresh = generate_refresh_token()
        await self._auth_sessions.create(
            user_id=user.id,
            refresh_token_hash=hash_refresh_token(raw_refresh),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
        )
        return access_token, raw_refresh

    async def refresh(self, raw_refresh_token: str) -> tuple[str, str, User]:
        """Validates and rotates a refresh token.

        Reuse of an already-rotated (or already-revoked) token is treated as
        a compromise signal: every active session for that user is revoked
        immediately, forcing a fresh login everywhere. This is what makes
        rotation actually detect theft rather than just limiting a stolen
        token's lifetime.
        """
        token_hash = hash_refresh_token(raw_refresh_token)
        auth_session = await self._auth_sessions.get_by_refresh_token_hash(token_hash)
        if auth_session is None:
            raise UnauthorizedException("Invalid refresh token.")

        if auth_session.revoked_at is not None:
            logger.warning("refresh_token_reuse_detected", user_id=str(auth_session.user_id))
            # This revocation MUST survive even though we're about to raise —
            # app.db.engine.get_db_session wraps every request in one
            # transaction and rolls the whole thing back on any exception, so
            # revoking here-and-then-raising in the same session would
            # silently undo the revoke (verified live: without this, a
            # reused token's sibling session stayed valid). A short-lived,
            # independently-committed session guarantees it persists
            # regardless of what happens to the caller's own transaction.
            async with self._fresh_session_factory() as fresh_session:
                await AuthSessionRepository(fresh_session).revoke_all_for_user(auth_session.user_id)
                await fresh_session.commit()
            raise UnauthorizedException("Invalid refresh token.")

        if auth_session.expires_at <= datetime.now(timezone.utc):
            raise UnauthorizedException("Refresh token has expired.")

        user = await self._users.get_by_id(auth_session.user_id)
        if user is None or not user.is_active:
            raise UnauthorizedException("Invalid refresh token.")

        # Rotate: mark this one used+revoked in a single update, then issue a new pair.
        now = datetime.now(timezone.utc)
        await self._auth_sessions.update(auth_session, revoked_at=now, last_used_at=now)
        access_token, new_raw_refresh = await self.issue_token_pair(user)
        logger.info("refresh_token_rotated", user_id=str(user.id))
        return access_token, new_raw_refresh, user

    async def logout(self, raw_refresh_token: str) -> None:
        """Idempotent: logging out an already-revoked or unrecognized token
        is a no-op, not an error — a client retrying a logout shouldn't see
        a failure."""
        token_hash = hash_refresh_token(raw_refresh_token)
        auth_session = await self._auth_sessions.get_by_refresh_token_hash(token_hash)
        if auth_session is not None and auth_session.revoked_at is None:
            await self._auth_sessions.revoke(auth_session)
            logger.info("user_logout", user_id=str(auth_session.user_id))

    async def logout_all(self, user_id: uuid.UUID) -> None:
        await self._auth_sessions.revoke_all_for_user(user_id)
        logger.info("user_logout_all", user_id=str(user_id))
