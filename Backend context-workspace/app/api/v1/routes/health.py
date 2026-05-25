"""
app/api/v1/routes/health.py
────────────────────────────
Health & readiness endpoints.
GET /api/v1/health      – shallow liveness (always fast)
GET /api/v1/health/db   – deep readiness (tests DB connectivity)
"""

from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.core.settings import settings
from app.db.engine import get_engine

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Liveness probe")
async def health() -> dict:
    """Returns 200 immediately. Use for container liveness checks."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "env": settings.app_env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/db", summary="Readiness probe — database")
async def health_db() -> dict:
    """
    Executes a trivial query against PostgreSQL.
    Returns 200 if the database is reachable, 503 otherwise.
    Suitable for Kubernetes readiness probes.
    """
    from fastapi import status
    from fastapi.responses import JSONResponse

    try:
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as exc:
        db_status = f"error: {exc}"
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "database": db_status},
        )

    return {
        "status": "ok",
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
