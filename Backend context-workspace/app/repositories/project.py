"""
app/repositories/project.py
─────────────────────────────
ProjectRepository – data-access layer for the Project model.
All queries live here; services call repositories, never raw SQLAlchemy.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.models.context import Context
from app.models.project import Project
from app.models.session import Session
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    model = Project

    async def list_projects(
        self, *, offset: int = 0, limit: int = 100
    ) -> tuple[list[Project], int]:
        """Return a page of projects and the total count."""
        count_result = await self.session.execute(
            select(func.count()).select_from(Project)
        )
        total = count_result.scalar_one()

        stmt = (
            select(Project)
            .order_by(Project.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total

    async def get_counts(self, project_id: uuid.UUID) -> tuple[int, int]:
        """Return (session_count, context_count) for one project — used to enrich responses."""
        s_count = await self.session.execute(
            select(func.count()).select_from(Session)
            .where(Session.project_id == project_id)
        )
        c_count = await self.session.execute(
            select(func.count()).select_from(Context)
            .join(Session, Context.session_id == Session.id)
            .where(Session.project_id == project_id)
        )
        return s_count.scalar_one(), c_count.scalar_one()
