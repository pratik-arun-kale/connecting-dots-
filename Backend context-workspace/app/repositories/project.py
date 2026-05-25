"""
app/repositories/project.py
─────────────────────────────
ProjectRepository – data-access layer for the Project model.
All queries live here; services call repositories, never raw SQLAlchemy.
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.models.project import Project
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
