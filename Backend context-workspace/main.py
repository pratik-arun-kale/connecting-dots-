"""
main.py
────────
FastAPI application factory and entry-point.

create_app() is kept as a factory function to facilitate testing (each test
can call create_app() and get a fresh, isolated instance).
"""

from contextlib import asynccontextmanager

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


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup / shutdown hook.
    All long-lived resources (DB pool, Redis) are initialised here and
    cleaned up on shutdown — not inside endpoint handlers.
    """
    logger.info(
        "app_starting",
        name=settings.app_name,
        version=settings.app_version,
        env=settings.app_env,
    )
    logger.info(
        "cors_allowed_origins",
        origins=settings.allowed_origins,
    )

    # Future: initialise Redis, AI SDK clients, embedding model warm-up, etc.
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

    # ── Middleware (order matters — outermost runs first) ─────────────────────
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


app = create_app()
