"""
app/utils/redis.py
───────────────────
Redis client placeholder — NOT active.

This module defines the interface that the rest of the application will use
once Redis is introduced. Import get_redis_client() from here everywhere so
that the single change to activate Redis is isolated to this file.

Future uses:
  - Response caching (project / session lists)
  - Rate-limiting counters (per-IP, per-user)
  - Background task queues (Celery / arq broker URL)
  - WebSocket presence / pub-sub
  - Idempotency key store for AI pipeline jobs
"""

from __future__ import annotations

from app.core.logging import get_logger

logger = get_logger(__name__)


class _RedisStub:
    """Drop-in stand-in that logs a warning instead of connecting."""

    async def get(self, key: str) -> None:  # noqa: D401
        logger.warning("redis_stub_called", method="get", key=key)
        return None

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        logger.warning("redis_stub_called", method="set", key=key)

    async def delete(self, key: str) -> None:
        logger.warning("redis_stub_called", method="delete", key=key)

    async def close(self) -> None:
        pass


_client: _RedisStub | None = None


async def get_redis_client() -> _RedisStub:
    """
    Return the active Redis client.

    To activate Redis:
      1. pip install redis hiredis
      2. Replace _RedisStub with:
           import redis.asyncio as aioredis
           client = aioredis.from_url(settings.redis_url, decode_responses=True)
      3. Store in _client and return it.
    """
    global _client
    if _client is None:
        _client = _RedisStub()
        logger.info("redis_stub_initialised")
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
