"""
app/middleware/logging.py
──────────────────────────
Request/response logging middleware.
Injects a unique request_id into structlog's context vars so every log
line emitted during a request is correlated automatically.
"""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Attach a request_id to each request and emit structured access logs."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        start = time.perf_counter()

        # Bind request_id to all log records emitted during this request
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        response: Response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        origin = request.headers.get("origin")
        logger.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            origin=origin,  # [DEBUG] remove once CORS is verified stable
        )

        # Echo the request_id back to the caller for traceability
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
