"""
app/services/project.py
────────────────────────
ProjectService – business logic for the Project resource.
Services are the boundary between routes and repositories.
They own validation, orchestration, and domain rules.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.core.logging import get_logger
from app.models.project import Project
from app.repositories.project import ProjectRepository
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

logger = get_logger(__name__)


class ProjectService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = ProjectRepository(session)

    # ── Queries ───────────────────────────────────────────────────────────────

    async def list_projects(
        self, *, offset: int = 0, limit: int = 100
    ) -> tuple[list[ProjectResponse], int]:
        projects, total = await self._repo.list_projects(offset=offset, limit=limit)
        logger.debug("projects_listed", total=total)

        # Enrich each project with its session + context counts
        enriched: list[ProjectResponse] = []
        for p in projects:
            s_count, c_count = await self._repo.get_counts(p.id)
            resp = ProjectResponse.model_validate(p)
            resp.session_count = s_count
            resp.context_count = c_count
            enriched.append(resp)

        return enriched, total

    async def get_project(self, project_id: uuid.UUID) -> Project:
        project = await self._repo.get_by_id(project_id)
        if project is None:
            raise NotFoundException(f"Project {project_id} not found.")
        return project

    # ── Mutations ─────────────────────────────────────────────────────────────

    async def create_project(self, payload: ProjectCreate) -> Project:
        project = await self._repo.create(
            name=payload.name,
            description=payload.description,
        )
        logger.info("project_created", project_id=str(project.id), name=project.name)
        return project

    async def update_project(
        self, project_id: uuid.UUID, payload: ProjectUpdate
    ) -> Project:
        project = await self.get_project(project_id)
        update_data = payload.model_dump(exclude_unset=True)
        project = await self._repo.update(project, **update_data)
        logger.info("project_updated", project_id=str(project_id))
        return project

    async def delete_project(self, project_id: uuid.UUID) -> None:
        project = await self.get_project(project_id)
        await self._repo.delete(project)
        logger.info("project_deleted", project_id=str(project_id))
