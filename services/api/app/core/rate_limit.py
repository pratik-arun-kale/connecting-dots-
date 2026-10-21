"""
app/core/rate_limit.py
─────────────────────────
Lightweight in-process rate limiting for the auth endpoints
(/auth/register, /auth/login, /auth/refresh).

NOT Redis-backed, deliberately: app/utils/redis.py is an explicitly-labeled
stub ("NOT active" — see its docstring) that just logs a warning and no-ops,
and no Redis server is actually running in this environment (confirmed —
`docker ps` finds nothing). Standing up a real Redis dependency just for
this would be exactly the "unnecessary distributed infrastructure" the spec
asked to avoid. A single-process, in-memory fixed-window counter is the
smallest thing that actually works today.

Limitation, stated plainly: this only limits requests within ONE backend
process. It does nothing across multiple replicas/workers. If this app is
ever horizontally scaled, activate the real client in app/utils/redis.py
(it already documents exactly how) and swap this module's storage for a
Redis INCR+EXPIRE — the call site (the `rate_limit()` dependency factory)
would not need to change.
"""
from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import Request

from app.core.exceptions import TooManyRequestsException

# key -> list of request timestamps (epoch seconds) within the current window
_buckets: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def _client_ip(request: Request) -> str:
    # Trust X-Forwarded-For only if you control the proxy in front of this
    # app; here we deliberately use the direct connection to avoid a client
    # spoofing the header to reset their own rate limit.
    return request.client.host if request.client else "unknown"


def rate_limit(key_prefix: str, max_requests: int, window_seconds: int):
    """Returns a FastAPI dependency enforcing max_requests per window_seconds,
    keyed by (key_prefix, client IP). Raises TooManyRequestsException (429)
    once the window is exhausted."""

    def _dependency(request: Request) -> None:
        key = f"{key_prefix}:{_client_ip(request)}"
        now = time.monotonic()
        cutoff = now - window_seconds

        with _lock:
            bucket = _buckets[key]
            # Drop timestamps outside the current window.
            fresh = [t for t in bucket if t > cutoff]
            if len(fresh) >= max_requests:
                _buckets[key] = fresh
                raise TooManyRequestsException(
                    f"Too many attempts — try again in a few minutes.",
                )
            fresh.append(now)
            _buckets[key] = fresh

    return _dependency
