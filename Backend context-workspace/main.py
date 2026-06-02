"""
main.py
────────
FastAPI application factory and entry-point.
"""

from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.settings import settings
from app.db.engine import dispose_engine
from app.middleware.logging import RequestLoggingMiddleware
from app.utils.redis import close_redis

configure_logging()
logger = get_logger(__name__)


# ── Extension CORS shim ───────────────────────────────────────────────────────

class ExtensionCORSMiddleware:
    """Pure-ASGI middleware that adds CORS headers for chrome-extension:// origins.

    Starlette's CORSMiddleware allow_origin_regex is silently swallowed when
    wrapped by BaseHTTPMiddleware (used by RequestLoggingMiddleware) because
    BaseHTTPMiddleware intercepts the ASGI send() before inner middleware can
    write response headers. This shim runs at the outermost ASGI layer —
    above everything — and adds headers directly into the response start message.
    """

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Read Origin header
        headers = dict(scope.get("headers", []))
        origin = headers.get(b"origin", b"").decode()

        is_extension = origin.startswith("chrome-extension://")

        # For extension origins: handle OPTIONS preflight ourselves
        if is_extension and scope["method"] == "OPTIONS":
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"access-control-allow-origin",      origin.encode()),
                    (b"access-control-allow-credentials", b"true"),
                    (b"access-control-allow-methods",     b"GET, POST, PUT, PATCH, DELETE, OPTIONS"),
                    (b"access-control-allow-headers",     b"*"),
                    (b"access-control-max-age",           b"600"),
                    (b"content-length",                   b"0"),
                ],
            })
            await send({"type": "http.response.body", "body": b""})
            return

        if not is_extension:
            await self.app(scope, receive, send)
            return

        # Wrap send() to inject CORS headers into the response start message
        async def send_with_cors(message):
            if message["type"] == "http.response.start":
                extra = [
                    (b"access-control-allow-origin",      origin.encode()),
                    (b"access-control-allow-credentials", b"true"),
                ]
                message = {
                    **message,
                    "headers": list(message.get("headers", [])) + extra,
                }
            await send(message)

        await self.app(scope, receive, send_with_cors)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("app_starting", name=settings.app_name,
                version=settings.app_version, env=settings.app_env)
    logger.info("cors_allowed_origins", origins=settings.allowed_origins)
    yield
    logger.info("app_shutting_down")
    await dispose_engine()
    await close_redis()
    logger.info("app_stopped")


# ── Application factory ───────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "AI Context Workspace API — captures, stores, and structures AI "
            "session content from multiple platforms."
        ),
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # ── Middleware ────────────────────────────────────────────────────────────
    # Standard CORS for listed origins (localhost, AI platforms, known ext ID)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestLoggingMiddleware)

    # ── Exception handlers ────────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Routes ────────────────────────────────────────────────────────────────
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    return app


def _build_app() -> Callable:
    """Wrap the FastAPI app with the extension CORS shim at the ASGI level."""
    fastapi_app = create_app()
    if settings.is_development:
        return ExtensionCORSMiddleware(fastapi_app)
    return fastapi_app


app = _build_app()
