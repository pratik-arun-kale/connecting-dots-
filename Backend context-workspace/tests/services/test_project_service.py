"""
tests/services/test_project_service.py
────────────────────────────────────────
Unit tests for ProjectService.
These call the service directly (no HTTP) to test business logic in isolation.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.project import ProjectService


@pytest.mark.asyncio
async def test_create_and_retrieve_project(db_session: AsyncSession) -> None:
    service = ProjectService(db_session)
    payload = ProjectCreate(name="Unit Test Project", description="From unit test")
    project = await service.create_project(payload)

    assert project.id is not None
    assert project.name == "Unit Test Project"

    retrieved = await service.get_project(project.id)
    assert retrieved.id == project.id


@pytest.mark.asyncio
async def test_get_project_not_found_raises(db_session: AsyncSession) -> None:
    service = ProjectService(db_session)
    with pytest.raises(NotFoundException):
        await service.get_project(uuid.uuid4())


@pytest.mark.asyncio
async def test_list_projects_returns_all(db_session: AsyncSession) -> None:
    service = ProjectService(db_session)
    for i in range(3):
        await service.create_project(ProjectCreate(name=f"Project {i}"))

    projects, total = await service.list_projects()
    assert total == 3
    assert len(projects) == 3


@pytest.mark.asyncio
async def test_update_project(db_session: AsyncSession) -> None:
    service = ProjectService(db_session)
    project = await service.create_project(ProjectCreate(name="Before"))
    updated = await service.update_project(project.id, ProjectUpdate(name="After"))
    assert updated.name == "After"


@pytest.mark.asyncio
async def test_delete_project(db_session: AsyncSession) -> None:
    service = ProjectService(db_session)
    project = await service.create_project(ProjectCreate(name="Doomed"))
    await service.delete_project(project.id)
    with pytest.raises(NotFoundException):
        await service.get_project(project.id)
