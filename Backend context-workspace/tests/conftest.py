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

import asyncio
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

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

@pytest.fixture(scope="session")
def event_loop():
    """Single event loop for all tests in the session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Each test gets a fresh session wrapped in a savepoint.
    The outer transaction is never committed → automatic rollback.
    """
    factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with factory() as session:
        async with session.begin():
            yield session
            await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient bound to the test app.
    The db_session dependency is overridden so routes use the same
    test session (and therefore see the same in-progress transaction).
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
