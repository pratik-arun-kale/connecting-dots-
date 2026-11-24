"""
main.py
────────
FastAPI application factory and entry-point.
"""

import asyncio
from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.rag import index_db
from app.core.settings import settings
from app.db.engine import dispose_engine
from app.middleware.body_limit import BodySizeLimitMiddleware
from app.middleware.logging import RequestLoggingMiddleware

configure_logging()
logger = get_logger(__name__)


# ── Extension CORS shim ───────────────────────────────────────────────────────

def _extension_origin_allowed(origin: str) -> bool:
    """Only the configured EXTENSION_ORIGIN gets CORS headers — any other
    installed extension is treated like any other unknown origin. With
    EXTENSION_ORIGIN unset, development still accepts every extension (an
    unpacked extension's ID changes with its folder); other environments
    accept none."""
    if settings.extension_origin:
        return origin == settings.extension_origin
    return settings.is_development


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

        is_extension = origin.startswith("chrome-extension://") and _extension_origin_allowed(origin)

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

async def _preload_rag_models() -> None:
    """Load the embedding model and reranker before the first request, so a
    capture or search never stalls the API while torch loads them. A failure
    (no network to fetch a model, say) is logged, not fatal: search then
    retries on first use, as before."""
    from app.core.rag import embedder, pipeline

    try:
        await asyncio.to_thread(embedder.embed_query, "warm up")
        await asyncio.to_thread(pipeline._get_reranker)
        logger.info("rag_models_loaded")
    except Exception:
        logger.exception("rag_models_preload_failed")


async def _purge_trash_periodically() -> None:
    """Removes Trash older than settings.trash_retention_days, at startup and
    then every trash_purge_interval_hours. Idempotent, so several API
    processes doing it is harmless (scripts/purge_trash.py is the cron
    alternative; set TRASH_PURGE_INTERVAL_HOURS=0 to use only that)."""
    from app.db.engine import get_session_factory
    from app.services.trash import TrashService

    while True:
        try:
            async with get_session_factory()() as session:
                await TrashService(session).purge_expired()
                await session.commit()
        except Exception:  # never let a failed purge take the API down
            logger.exception("trash_purge_failed")
        await asyncio.sleep(settings.trash_purge_interval_hours * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("app_starting", name=settings.app_name,
                version=settings.app_version, env=settings.app_env)
    logger.info("cors_allowed_origins", origins=settings.allowed_origins)
    if settings.rag_preload_models:
        await _preload_rag_models()
    purge_task = asyncio.create_task(_purge_trash_periodically()) if settings.trash_purge_interval_hours > 0 else None
    yield
    logger.info("app_shutting_down")
    if purge_task is not None:
        purge_task.cancel()
    await dispose_engine()
    index_db.dispose()
    logger.info("app_stopped")


# ── Application factory ───────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "Connecting Dots API — captures, stores, and structures AI "
            "session content from multiple platforms."
        ),
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # ── Middleware ────────────────────────────────────────────────────────────
    # Added first, so it sits inside CORS and logging: a 413 still carries
    # CORS headers (the browser can read it) and is logged.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)
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
