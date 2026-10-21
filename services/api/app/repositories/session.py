"""
app/repositories/session.py
────────────────────────────
SessionRepository – data-access layer for the Session model.
"""

from __future__ import annotations

import uuid

from datetime import datetime, timezone

from sqlalchemy import func, select

from app.models.project import Project
from app.models.session import LinkStatus, Session, SessionState
from app.repositories.base import BaseRepository


class SessionRepository(BaseRepository[Session]):
    model = Session

    async def get_by_id_for_owner(self, session_id: uuid.UUID, owner_id: uuid.UUID) -> Session | None:
        """Ownership check via JOIN through Project — sessions don't carry
        their own user_id (per the plan: ownership lives on Project, and
        Session/Context inherit it through the FK chain rather than
        duplicating a user_id column onto every table)."""
        result = await self.session.execute(
            select(Session)
            .join(Project, Session.project_id == Project.id)
            .where(Session.id == session_id, Project.user_id == owner_id)
        )
        return result.scalar_one_or_none()

    async def list_by_project(
        self,
        project_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> tuple[list[Session], int]:
        """All sessions for a project, newest first, with total count."""
        count_result = await self.session.execute(
            select(func.count()).select_from(Session).where(Session.project_id == project_id)
        )
        total = count_result.scalar_one()

        stmt = (
            select(Session)
            .where(Session.project_id == project_id)
            .order_by(Session.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total

    async def get_capture_session(
        self,
        project_id: uuid.UUID,
        platform: str,
        chat_url: str,
    ) -> Session | None:
        """Find the capture-created session for this exact conversation URL."""
        result = await self.session.execute(
            select(Session).where(
                Session.project_id == project_id,
                Session.source_platform == platform,
                Session.linked_url == chat_url,
            ).limit(1)
        )
        return result.scalar_one_or_none()

    async def create_capture_session(
        self,
        project_id: uuid.UUID,
        platform: str,
        chat_url: str,
        title: str | None = None,
    ) -> Session:
        """Create a session that is immediately completed — no FSM traversal needed
        because the capture already has the conversation URL."""
        now = datetime.now(timezone.utc)
        return await self.create(
            project_id=project_id,
            source_platform=platform,
            session_state=SessionState.COMPLETED,
            title=title,
            linked_url=chat_url,
            tab_url=chat_url,
            link_status=LinkStatus.LINKED,
            linked_at=now,
        )

    async def get_active_for_project_and_platform(
        self,
        project_id: uuid.UUID,
        platform: str,
    ) -> Session | None:
        """Return the non-terminal session for (project, platform), if any.

        Used to enforce the one-active-session-per-provider invariant
        without relying solely on the DB partial unique index.
        """
        stmt = (
            select(Session)
            .where(
                Session.project_id == project_id,
                Session.source_platform == platform,
                Session.session_state.notin_(list(SessionState.TERMINAL)),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
