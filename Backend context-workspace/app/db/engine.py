"""
app/db/engine.py
─────────────────
Async SQLAlchemy engine and session factory.
A single engine is created at startup and shared across the application.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.logging import get_logger
from app.core.settings import settings

logger = get_logger(__name__)

# ── Engine ───────────────────────────────────────────────────────────────────
# pool_pre_ping – detects stale connections before use (important for
#   containerised databases that may restart).
# echo – only enabled in development to surface generated SQL.

_engine: AsyncEngine | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            # future-ready: pass json_serializer / json_deserializer here
            # when JSONB columns carry domain objects.
        )
        logger.info("database_engine_created", url=settings.database_url)
    return _engine


# ── Session factory ───────────────────────────────────────────────────────────
# expire_on_commit=False is critical for async usage — avoids lazy-loading
# after commit which would raise MissingGreenlet errors.

_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _async_session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a transactional async session.
    The session is committed on success and rolled back on any exception.
    """
    factory = get_session_factory()
    async with factory() as session:
        async with session.begin():
            try:
                yield session
            except Exception:
                await session.rollback()
                raise


# ── Lifecycle helpers (called from app lifespan) ─────────────────────────────

async def dispose_engine() -> None:
    """Gracefully close all pooled connections. Call on app shutdown."""
    global _engine
    if _engine is not None:
        await _engine.dispose()
        logger.info("database_engine_disposed")
        _engine = None
