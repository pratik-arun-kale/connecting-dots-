"""
tests/services/test_auth_service.py
──────────────────────────────────────
Unit tests for AuthService — register/authenticate/token issuance/refresh
rotation+reuse-detection/logout, called directly (no HTTP).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.exceptions import ConflictException, ForbiddenException, UnauthorizedException
from app.core.security import decode_access_token, hash_refresh_token
from app.schemas.auth import LoginRequest, RegisterRequest
from app.services.auth import AuthService
from tests.conftest import TEST_DB_URL


@pytest.mark.asyncio
async def test_register_creates_a_user_with_a_hashed_password(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="new@test.com", password="password123"))
    assert user.email == "new@test.com"
    assert user.password_hash != "password123"
    assert user.is_active is True


@pytest.mark.asyncio
async def test_register_normalizes_email_case_and_whitespace(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="  MixedCase@Test.com  ", password="password123"))
    assert user.email == "mixedcase@test.com"


@pytest.mark.asyncio
async def test_register_rejects_a_duplicate_email(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    await service.register(RegisterRequest(email="dup@test.com", password="password123"))
    with pytest.raises(ConflictException):
        await service.register(RegisterRequest(email="dup@test.com", password="differentpass"))


@pytest.mark.asyncio
async def test_register_rejects_a_duplicate_email_regardless_of_case(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    await service.register(RegisterRequest(email="dup2@test.com", password="password123"))
    with pytest.raises(ConflictException):
        await service.register(RegisterRequest(email="DUP2@TEST.com", password="differentpass"))


@pytest.mark.asyncio
async def test_authenticate_succeeds_with_correct_credentials(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    await service.register(RegisterRequest(email="login@test.com", password="password123"))
    user = await service.authenticate(LoginRequest(email="login@test.com", password="password123"))
    assert user.email == "login@test.com"
    assert user.last_login_at is not None


@pytest.mark.asyncio
async def test_authenticate_fails_with_wrong_password(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    await service.register(RegisterRequest(email="login2@test.com", password="password123"))
    with pytest.raises(UnauthorizedException) as exc_info:
        await service.authenticate(LoginRequest(email="login2@test.com", password="wrongpassword"))
    assert exc_info.value.message == "Invalid email or password."


@pytest.mark.asyncio
async def test_authenticate_fails_for_a_nonexistent_email_with_the_same_generic_message(
    db_session: AsyncSession,
) -> None:
    service = AuthService(db_session)
    with pytest.raises(UnauthorizedException) as exc_info:
        await service.authenticate(LoginRequest(email="doesnotexist@test.com", password="whatever123"))
    # Same message as the wrong-password case — never reveals which check failed.
    assert exc_info.value.message == "Invalid email or password."


@pytest.mark.asyncio
async def test_authenticate_rejects_an_inactive_user(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="inactive@test.com", password="password123"))
    await service._users.update(user, is_active=False)

    with pytest.raises(ForbiddenException):
        await service.authenticate(LoginRequest(email="inactive@test.com", password="password123"))


@pytest.mark.asyncio
async def test_issue_token_pair_returns_a_decodable_access_token(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="tokens@test.com", password="password123"))
    access_token, refresh_token = await service.issue_token_pair(user)

    payload = decode_access_token(access_token)
    assert payload["sub"] == str(user.id)
    assert len(refresh_token) >= 64


@pytest.mark.asyncio
async def test_refresh_rotates_the_token_and_returns_a_new_pair(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="refresh@test.com", password="password123"))
    _, refresh_token = await service.issue_token_pair(user)

    new_access, new_refresh, refreshed_user = await service.refresh(refresh_token)
    assert refreshed_user.id == user.id
    assert new_refresh != refresh_token


@pytest.mark.asyncio
async def test_refresh_rejects_an_unknown_token(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    with pytest.raises(UnauthorizedException):
        await service.refresh("a-token-that-was-never-issued")


@pytest.mark.asyncio
async def test_refresh_rejects_an_expired_token(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="expired@test.com", password="password123"))
    _, refresh_token = await service.issue_token_pair(user)

    # Force it into the past directly via the repository.
    auth_session = await service._auth_sessions.get_by_refresh_token_hash(hash_refresh_token(refresh_token))
    await service._auth_sessions.update(auth_session, expires_at=datetime.now(timezone.utc) - timedelta(days=1))

    with pytest.raises(UnauthorizedException):
        await service.refresh(refresh_token)


@pytest.mark.asyncio
async def test_reusing_an_already_rotated_refresh_token_revokes_the_whole_session_chain(
    db_session: AsyncSession,
) -> None:
    """A same-transaction sanity check: within one session, replaying the
    stale token is rejected immediately after rotation. The full "every
    OTHER sibling session also gets revoked" guarantee needs real commit
    boundaries between steps (see the dedicated test below) — the reuse
    path deliberately durably commits its revocation from a fresh session
    (app/services/auth.py) so it survives the ambient per-request rollback
    in production; within one shared, never-committed test transaction that
    fresh session can't see this session's uncommitted writes at all."""
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="reuse@test.com", password="password123"))
    _, original_refresh = await service.issue_token_pair(user)

    _, rotated_refresh, _ = await service.refresh(original_refresh)

    with pytest.raises(UnauthorizedException):
        await service.refresh(original_refresh)


@pytest.mark.asyncio
async def test_reuse_detection_revokes_sibling_sessions_across_real_commits(
    _test_schema: None,
) -> None:
    """The full cross-session theft-detection guarantee, exercised against
    REAL commit boundaries (one fresh, committing session per step) rather
    than the shared rollback-per-test fixture — this mirrors how requests
    actually behave in production (each request commits before the next
    begins), which is exactly the scenario the fresh-session-commit code in
    AuthService.refresh() exists for. Verified live against the running
    server during implementation; this locks the same behavior in as an
    automated regression test.

    Uses its own engine (schema already created by _test_schema) rather
    than the rollback-wrapped db_session fixture, since this test's whole
    point is to observe commits actually landing across separate sessions.
    Data written here is NOT rolled back — cleaned up only when
    _test_schema drops all tables at the end of the test session; unique
    emails avoid collisions with other tests in the meantime.
    """
    engine = create_async_engine(TEST_DB_URL, echo=False)
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def _commit_step(fn):
            async with factory() as session:
                result = await fn(AuthService(session, session_factory=factory))
                await session.commit()
                return result

        user = await _commit_step(
            lambda svc: svc.register(RegisterRequest(email="reuse-commits@test.com", password="password123"))
        )
        _, original_refresh = await _commit_step(lambda svc: svc.issue_token_pair(user))
        _, rotated_refresh, _ = await _commit_step(lambda svc: svc.refresh(original_refresh))

        # Replaying the stale, already-rotated token — this commits its own
        # revoke-everything side effect internally before raising.
        async with factory() as session:
            with pytest.raises(UnauthorizedException):
                await AuthService(session, session_factory=factory).refresh(original_refresh)
            await session.commit()  # nothing to commit for THIS session, but mirrors get_db_session's real flow

        # The legitimately-rotated token must now ALSO be dead, visible from a
        # brand-new session/connection — proving the revoke was durably committed.
        async with factory() as session:
            with pytest.raises(UnauthorizedException):
                await AuthService(session, session_factory=factory).refresh(rotated_refresh)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_logout_revokes_only_the_given_session(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="logout@test.com", password="password123"))
    _, refresh_a = await service.issue_token_pair(user)
    _, refresh_b = await service.issue_token_pair(user)

    await service.logout(refresh_a)

    with pytest.raises(UnauthorizedException):
        await service.refresh(refresh_a)
    # refresh_b is a separate session — untouched.
    await service.refresh(refresh_b)


@pytest.mark.asyncio
async def test_logout_is_idempotent_for_an_unknown_token(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    await service.logout("a-token-that-was-never-issued")  # must not raise


@pytest.mark.asyncio
async def test_logout_all_revokes_every_session_for_the_user(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user = await service.register(RegisterRequest(email="logoutall@test.com", password="password123"))
    _, refresh_a = await service.issue_token_pair(user)
    _, refresh_b = await service.issue_token_pair(user)

    await service.logout_all(user.id)

    with pytest.raises(UnauthorizedException):
        await service.refresh(refresh_a)
    with pytest.raises(UnauthorizedException):
        await service.refresh(refresh_b)


@pytest.mark.asyncio
async def test_logout_all_does_not_affect_another_users_sessions(db_session: AsyncSession) -> None:
    service = AuthService(db_session)
    user_a = await service.register(RegisterRequest(email="usera-logoutall@test.com", password="password123"))
    user_b = await service.register(RegisterRequest(email="userb-logoutall@test.com", password="password123"))
    _, refresh_a = await service.issue_token_pair(user_a)
    _, refresh_b = await service.issue_token_pair(user_b)

    await service.logout_all(user_a.id)

    with pytest.raises(UnauthorizedException):
        await service.refresh(refresh_a)
    # User B's session survives User A's logout-all.
    await service.refresh(refresh_b)
