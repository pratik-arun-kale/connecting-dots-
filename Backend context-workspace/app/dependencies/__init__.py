"""
app/dependencies/__init__.py
─────────────────────────────
FastAPI dependency functions.
Routes declare these as Depends() parameters; FastAPI resolves them automatically.
Services are re-created per-request to stay within the session transaction boundary.
"""

import uuid
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedException
from app.core.security import decode_access_token
from app.core.settings import settings
from app.db.engine import get_db_session
from app.models.user import User
from app.repositories.user import UserRepository
from app.services.auth import AuthService
from app.services.context import ContextService
from app.services.project import ProjectService
from app.services.rag_service import RagService
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


def get_rag_service() -> RagService:
    return RagService()


def get_auth_service(db: DbSession) -> AuthService:
    return AuthService(db)


# ── Annotated aliases (convenience for route signatures) ─────────────────────

ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
SessionServiceDep = Annotated[SessionService, Depends(get_session_service)]
ContextServiceDep = Annotated[ContextService, Depends(get_context_service)]
RagServiceDep     = Annotated[RagService,     Depends(get_rag_service)]
AuthServiceDep    = Annotated[AuthService,    Depends(get_auth_service)]

# ── Current user (authentication) ────────────────────────────────────────────
# tokenUrl is only used to populate OpenAPI/Swagger's "Authorize" flow — the
# actual token is always a JSON body field (see app/schemas/auth.py), this
# just tells the docs UI where to send the login form.
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login", auto_error=False)


async def get_current_user(
    token: Annotated[str | None, Depends(_oauth2_scheme)],
    db: DbSession,
) -> User:
    if token is None:
        raise UnauthorizedException("Not authenticated.")
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise UnauthorizedException("Invalid or expired access token.")

    user = await UserRepository(db).get_by_id(user_id)
    if user is None:
        raise UnauthorizedException("Invalid or expired access token.")
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_active:
        raise UnauthorizedException("This account has been deactivated.")
    return current_user


CurrentUserDep = Annotated[User, Depends(get_current_active_user)]
