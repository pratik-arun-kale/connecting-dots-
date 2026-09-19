"""
tests/conftest.py
──────────────────
Shared pytest fixtures for async FastAPI testing.

Architecture:
  - Each test gets its own transaction that is rolled back after the test.
  - The async test client is bound to the same session used by the route handlers
    via dependency override — no real HTTP is involved.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.rate_limit import _buckets as _rate_limit_buckets
from app.core.settings import settings
from app.db.base import Base
from app.db.engine import get_db_session
from main import create_app

# ── Use a separate test database (override via TEST_DATABASE_URL env) ─────────
TEST_DB_URL = settings.database_url.replace(
    f"/{settings.postgres_db}",
    f"/{settings.postgres_db}_test",
)

# ── Engine / session scoped to the test session ───────────────────────────────
# No custom `event_loop` fixture here, and asyncio_default_fixture_loop_scope
# is deliberately left unset in pyproject.toml — see the comment there for
# why (a session-scoped loop deferred db_session's teardown to the end of
# the whole run instead of after each test).


@pytest_asyncio.fixture(scope="session")
async def _test_schema() -> AsyncGenerator[None, None]:
    """
    Creates the schema once for the whole test session, using its OWN
    short-lived engine that is fully disposed immediately after — never
    reused for an actual test query. This is deliberately separate from any
    engine a test later uses: sharing one session-scoped, pooled engine's
    connections across different test functions is what caused "Task ...
    got Future ... attached to a different loop" (a pooled asyncpg
    connection is bound to whatever event loop created it, and pytest-
    asyncio does not guarantee every test body runs in the same loop as a
    session-scoped fixture, regardless of asyncio_default_fixture_loop_scope).
    """
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    yield
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(_test_schema) -> AsyncGenerator[AsyncSession, None]:
    """
    Each test gets its OWN engine (created and disposed entirely within
    this one test's execution, so it can never outlive — or be reused
    across — a different test's event loop) and a session wrapped in a
    transaction that is unconditionally rolled back.

    `session.begin()` is used here NOT as a context manager (that form
    auto-commits/rolls-back on exit) — begun manually and rolled back
    explicitly once, so there's no ambiguity about a context manager ALSO
    trying to commit/rollback the same transaction afterward. The previous
    version wrapped the yield in `async with session.begin():` AND called
    `session.rollback()` inside it before that block's own exit tried to
    act on the same (already-ended) transaction again — harmless-looking,
    but it left the underlying connection "idle in transaction" server-side
    even after the fixture believed it had torn everything down, and those
    never actually got closed; five of them accumulate over five tests and
    the next thing needing a table lock (schema teardown, or simply the
    next test) blocks forever. Confirmed live via `pg_stat_activity` while
    debugging this.
    """
    engine = create_async_engine(TEST_DB_URL, echo=False)
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.begin()
            try:
                yield session
            finally:
                await session.rollback()
    finally:
        await engine.dispose()


@pytest.fixture(autouse=True)
def _reset_rate_limit_buckets() -> None:
    """The auth rate limiter (app/core/rate_limit.py) is a module-level,
    in-process dict keyed by client IP — every test-client request shares
    the same synthetic IP, so without this, the 5th+ test in a session that
    calls /auth/register (or login/refresh) would start getting real 429s
    from state left over by earlier tests."""
    _rate_limit_buckets.clear()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient bound to the test app.
    The db_session dependency is overridden so routes use the same
    test session (and therefore see the same in-progress transaction).

    Note: AuthService (see app/services/auth.py) derives its "independent,
    durably-committing session" factory from db_session's own bound engine
    when none is explicitly given — so no separate override is needed here
    for that to correctly target the test database instead of production.
    """
    app = create_app()

    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db_session] = _override_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def authenticated_client(client: AsyncClient) -> AsyncGenerator[AsyncClient, None]:
    """Registers a fresh user and pre-sets the Authorization header on the
    same `client` — the created user rolls back with everything else in
    db_session's transaction, so no cleanup is needed."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "fixture-user@test.com", "password": "fixture-password-123"},
    )
    assert resp.status_code == 201, resp.text
    access_token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {access_token}"
    yield client


@pytest_asyncio.fixture
async def second_authenticated_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """A second, distinct user with its own AsyncClient instance (so its
    Authorization header can never collide with `authenticated_client`'s),
    built the same way as the `client` fixture and sharing the same
    transactional db_session — for cross-user IDOR/authorization tests
    (User A / User B) where both identities must see the same in-progress
    test transaction."""
    app = create_app()

    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db_session] = _override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as second:
        resp = await second.post(
            "/api/v1/auth/register",
            json={"email": "fixture-user-2@test.com", "password": "fixture-password-456"},
        )
        assert resp.status_code == 201, resp.text
        second.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
        yield second
