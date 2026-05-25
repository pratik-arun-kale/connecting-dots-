"""
app/dependencies/__init__.py
─────────────────────────────
FastAPI dependency functions.
Routes declare these as Depends() parameters; FastAPI resolves them automatically.
Services are re-created per-request to stay within the session transaction boundary.
"""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.engine import get_db_session
from app.services.context import ContextService
from app.services.project import ProjectService
from app.services.session import SessionService

# ── Database session ──────────────────────────────────────────────────────────

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

# ── Service factories ─────────────────────────────────────────────────────────


def get_project_service(db: DbSession) -> ProjectService:
    return ProjectService(db)


def get_session_service(db: DbSession) -> SessionService:
    return SessionService(db)


def get_context_service(db: DbSession) -> ContextService:
    return ContextService(db)


# ── Annotated aliases (convenience for route signatures) ─────────────────────

ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
SessionServiceDep = Annotated[SessionService, Depends(get_session_service)]
ContextServiceDep = Annotated[ContextService, Depends(get_context_service)]
