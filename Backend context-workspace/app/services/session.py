"""
app/services/session.py
────────────────────────
SessionService – business logic for the Session resource.
The Chrome extension is the authoritative lifecycle driver;
this service records transitions and enforces invariants.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException, UnprocessableException
from app.core.logging import get_logger
from app.models.session import LinkStatus, Session, SessionState
from app.repositories.project import ProjectRepository
from app.repositories.session import SessionRepository
from app.schemas.session import (
    LinkSessionRequest,
    SessionCreate,
    SessionFailureRequest,
    SessionStateUpdate,
)

logger = get_logger(__name__)


class SessionService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = SessionRepository(db)
        self._project_repo = ProjectRepository(db)

    # ── Read ──────────────────────────────────────────────────────────────────

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
        sessions, total = await self._repo.list_by_project(project_id, offset=offset, limit=limit)
        logger.debug("sessions_listed", project_id=str(project_id), total=total)
        return sessions, total

    async def get_session(self, session_id: uuid.UUID) -> Session:
        session = await self._repo.get_by_id(session_id)
        if session is None:
            raise NotFoundException(f"Session {session_id} not found.")
        return session

    # ── Create ────────────────────────────────────────────────────────────────

    async def create_or_get_session(self, payload: SessionCreate) -> tuple[Session, bool]:
        """Idempotent create.

        Returns (session, created) where created=False means an existing
        non-terminal session was returned instead of creating a duplicate.
        """
        project = await self._project_repo.get_by_id(payload.project_id)
        if project is None:
            raise NotFoundException(f"Project {payload.project_id} not found.")

        existing = await self._repo.get_active_for_project_and_platform(
            payload.project_id, payload.source_platform
        )
        if existing:
            logger.info(
                "session_reused",
                session_id=str(existing.id),
                state=existing.session_state,
                platform=payload.source_platform,
            )
            return existing, False

        session = await self._repo.create(
            project_id=payload.project_id,
            source_platform=payload.source_platform,
            bootstrap_message=payload.bootstrap_message,
            session_state=SessionState.PENDING,
        )
        logger.info(
            "session_created",
            session_id=str(session.id),
            project_id=str(payload.project_id),
            platform=payload.source_platform,
        )
        return session, True

    # ── Lifecycle transitions ─────────────────────────────────────────────────

    async def transition_state(
        self, session_id: uuid.UUID, payload: SessionStateUpdate
    ) -> Session:
        """Record an FSM state transition reported by the extension."""
        session = await self._repo.get_by_id(session_id)
        if session is None:
            raise NotFoundException(f"Session {session_id} not found.")

        if session.session_state in SessionState.TERMINAL:
            raise ConflictException(
                f"Session {session_id} is already in terminal state '{session.session_state}'."
            )

        allowed = SessionState.TRANSITIONS.get(session.session_state, frozenset())
        if payload.state not in allowed:
            raise UnprocessableException(
                f"Transition {session.session_state!r} → {payload.state!r} is not allowed."
            )

        session = await self._repo.update(session, session_state=payload.state)
        logger.info(
            "session_state_transition",
            session_id=str(session_id),
            new_state=payload.state,
        )
        return session

    async def fail_session(
        self, session_id: uuid.UUID, payload: SessionFailureRequest
    ) -> Session:
        """Record terminal failure with reason."""
        session = await self._repo.get_by_id(session_id)
        if session is None:
            raise NotFoundException(f"Session {session_id} not found.")

        if session.session_state in SessionState.TERMINAL:
            # Idempotent: already failed/completed — return as-is
            return session

        session = await self._repo.update(
            session,
            session_state=SessionState.FAILED,
            failure_reason=payload.reason,
            failed_at=datetime.now(timezone.utc),
            link_status=LinkStatus.FAILED,
        )
        logger.warning(
            "session_failed",
            session_id=str(session_id),
            reason=payload.reason,
            detail=payload.detail,
        )
        return session

    async def link_session(
        self, session_id: uuid.UUID, payload: LinkSessionRequest
    ) -> Session:
        """Bind the captured conversation URL (called by extension after URL_DETECTED)."""
        session = await self._repo.get_by_id(session_id)
        if session is None:
            raise NotFoundException(f"Session {session_id} not found.")

        # Idempotent: same URL already linked
        if session.linked_url == payload.url and session.session_state == SessionState.COMPLETED:
            return session

        # Conflict: already linked to a different URL
        if session.linked_url is not None and session.linked_url != payload.url:
            raise ConflictException(
                f"Session {session_id} is already linked to a different URL.",
                details={"linked_url": session.linked_url},
            )

        session = await self._repo.update(
            session,
            linked_url=payload.url,
            link_status=LinkStatus.LINKED,
            linked_at=datetime.now(timezone.utc),
            session_state=SessionState.COMPLETED,
        )
        logger.info(
            "session_linked",
            session_id=str(session_id),
            url=payload.url,
        )
        return session
