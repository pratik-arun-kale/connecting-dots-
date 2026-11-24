"""
app/core/rate_limit.py
─────────────────────────
Lightweight in-process rate limiting: per client IP for the auth endpoints
(/auth/register, /auth/login, /auth/refresh), per user for capture, search
and Ask AI (see app.dependencies.user_rate_limit).

In memory, deliberately: one API process (Cloud Run max-instances 1 during
the beta), so a per-process fixed-window counter is the smallest thing that
works, with no extra service to run.

Limitation, stated plainly: this only limits requests within ONE backend
process. Before running several instances, move the counters to a shared
store (Redis INCR+EXPIRE, or a Postgres table); the call sites (the
`rate_limit()` dependency factory) would not need to change.
"""
from __future__ import annotations

import hmac
import ipaddress
import time
from collections import defaultdict
from threading import Lock

from fastapi import Request

from app.core.exceptions import TooManyRequestsException
from app.core.settings import settings

PROXY_SECRET_HEADER = "x-proxy-secret"
CLIENT_IP_HEADER = "x-client-ip"

# key -> list of request timestamps (epoch seconds) within the current window
_buckets: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def _ip(value: str | None) -> str | None:
    """`value` as a normalised IP address, or None if it isn't one."""
    try:
        return str(ipaddress.ip_address(value.strip())) if value else None
    except ValueError:
        return None


def client_ip(request: Request) -> str:
    """The address per-IP limits are keyed by. In order:

    1. X-Client-IP, only when X-Proxy-Secret matches PROXY_SHARED_SECRET:
       the dashboard's own proxy, reporting the browser it is forwarding for.
       Without this every dashboard user would share the proxy's address.
    2. With TRUSTED_PROXY_HOPS = n > 0, the n-th X-Forwarded-For entry from
       the right: the one our outermost proxy appended. Entries further left
       came from the caller, so sending a made-up X-Forwarded-For changes
       nothing.
    3. The TCP peer.

    Uvicorn must not rewrite request.client from X-Forwarded-For itself (the
    Dockerfile runs it with --no-proxy-headers), or step 3 would trust the
    leftmost entry.
    """
    secret = settings.proxy_shared_secret
    if secret:
        sent = request.headers.get(PROXY_SECRET_HEADER, "")
        if hmac.compare_digest(sent.encode(), secret.encode()):
            ip = _ip(request.headers.get(CLIENT_IP_HEADER))
            if ip:
                return ip

    hops = settings.trusted_proxy_hops
    if hops:
        entries = [
            entry
            for header in request.headers.getlist("x-forwarded-for")
            for entry in header.split(",")
            if entry.strip()
        ]
        if len(entries) >= hops:
            ip = _ip(entries[-hops])
            if ip:
                return ip

    return request.client.host if request.client else "unknown"


def check_rate_limit(key: str, max_requests: int, window_seconds: int, message: str) -> None:
    """Counts one request against `key` and raises TooManyRequestsException
    (429) once more than max_requests fall within the last window_seconds."""
    now = time.monotonic()
    cutoff = now - window_seconds

    with _lock:
        bucket = _buckets[key]
        # Drop timestamps outside the current window.
        fresh = [t for t in bucket if t > cutoff]
        if len(fresh) >= max_requests:
            _buckets[key] = fresh
            raise TooManyRequestsException(message)
        fresh.append(now)
        _buckets[key] = fresh


def rate_limit(key_prefix: str, max_requests: int, window_seconds: int):
    """Returns a FastAPI dependency enforcing max_requests per window_seconds,
    keyed by (key_prefix, client IP) — for routes with no user yet (auth).
    Signed-in routes limit per user instead: app.dependencies.user_rate_limit."""

    def _dependency(request: Request) -> None:
        check_rate_limit(
            f"{key_prefix}:{client_ip(request)}",
            max_requests,
            window_seconds,
            "Too many attempts — try again in a few minutes.",
        )

    return _dependency
