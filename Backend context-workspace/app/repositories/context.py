"""
app/repositories/context.py
────────────────────────────
ContextRepository – data-access layer for the Context model.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.models.context import Context
from app.models.session import Session
from app.repositories.base import BaseRepository





class ContextRepository(BaseRepository[Context]):
    model = Context

    async def get_by_idempotency_key(self, key: str) -> Context | None:
        result = await self.session.execute(
            select(Context).where(Context.idempotency_key == key)
        )
        return result.scalar_one_or_none()

    async def list_by_session(
        self,
        session_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> tuple[list[Context], int]:
        """Return all contexts for a session, oldest first, with total count."""
        count_result = await self.session.execute(
            select(func.count())
            .select_from(Context)
            .where(Context.session_id == session_id)
        )
        total = count_result.scalar_one()

        stmt = (
            select(Context)
            .where(Context.session_id == session_id)
            .order_by(Context.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total

    async def list_by_project(
        self,
        project_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[Context], int]:
        """Return all contexts across all sessions for a project, newest first."""
        count_result = await self.session.execute(
            select(func.count())
            .select_from(Context)
            .join(Session, Context.session_id == Session.id)
            .where(Session.project_id == project_id)
        )
        total = count_result.scalar_one()

        stmt = (
            select(Context)
            .join(Session, Context.session_id == Session.id)
            .where(Session.project_id == project_id)
            .order_by(Context.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total
