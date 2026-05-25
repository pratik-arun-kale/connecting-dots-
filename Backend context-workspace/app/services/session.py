"""
app/services/session.py
────────────────────────
SessionService – business logic for the Session resource.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException
from app.core.logging import get_logger
from app.models.session import LinkStatus, Session
from app.repositories.project import ProjectRepository
from app.repositories.session import SessionRepository
from app.schemas.session import LinkSessionRequest, SessionCreate

logger = get_logger(__name__)


class SessionService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = SessionRepository(db)
        self._project_repo = ProjectRepository(db)

    async def list_sessions_for_project(
        self,
        project_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> tuple[list[Session], int]:
        project = await self._project_repo.get_by_id(project_id)
        if project is None:
            raise NotFoundException(f"Project {project_id} not found.")

        sessions, total = await self._repo.list_by_project(
            project_id, offset=offset, limit=limit
        )
        logger.debug("sessions_listed", project_id=str(project_id), total=total)
        return sessions, total

    async def get_session(self, session_id: uuid.UUID) -> Session:
        session = await self._repo.get_by_id(session_id)
        if session is None:
            raise NotFoundException(f"Session {session_id} not found.")
        return session

    async def create_session(self, payload: SessionCreate) -> Session:
        project = await self._project_repo.get_by_id(payload.project_id)
        if project is None:
            raise NotFoundException(f"Project {payload.project_id} not found.")

        session = await self._repo.create(
            project_id=payload.project_id,
            source_platform=payload.source_platform,
            title=payload.title,
        )
        logger.info(
            "session_created",
            session_id=str(session.id),
            project_id=str(payload.project_id),
            platform=payload.source_platform,
        )
        return session

    async def link_session(
        self, session_id: uuid.UUID, payload: LinkSessionRequest
    ) -> Session:
        session = await self._repo.get_by_id(session_id)
        if session is None:
            raise NotFoundException(f"Session {session_id} not found.")

        if session.linked_url is not None:
            if session.linked_url == payload.url:
                # Idempotent: same URL sent again — return without touching the DB.
                logger.debug(
                    "session_link_noop",
                    session_id=str(session_id),
                    url=payload.url,
                )
                return session
            raise ConflictException(
                f"Session {session_id} is already linked to a different URL.",
                details={"linked_url": session.linked_url},
            )

        session = await self._repo.update(
            session,
            linked_url=payload.url,
            link_status=LinkStatus.LINKED,
            linked_at=datetime.now(timezone.utc),
        )
        logger.info(
            "session_linked",
            session_id=str(session_id),
            url=payload.url,
        )
        return session
