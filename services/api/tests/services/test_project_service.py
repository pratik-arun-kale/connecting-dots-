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
from app.core.security import hash_password
from app.repositories.user import UserRepository
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.project import ProjectService


async def _make_user(db_session: AsyncSession):
    return await UserRepository(db_session).create(
        email=f"{uuid.uuid4()}@test.com",
        password_hash=hash_password("irrelevant-password-123"),
    )


@pytest.mark.asyncio
async def test_create_and_retrieve_project(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    service = ProjectService(db_session)
    payload = ProjectCreate(name="Unit Test Project", description="From unit test")
    project = await service.create_project(payload, user.id)

    assert project.id is not None
    assert project.name == "Unit Test Project"
    assert project.user_id == user.id

    retrieved = await service.get_project(project.id, user.id)
    assert retrieved.id == project.id


@pytest.mark.asyncio
async def test_get_project_not_found_raises(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    service = ProjectService(db_session)
    with pytest.raises(NotFoundException):
        await service.get_project(uuid.uuid4(), user.id)


@pytest.mark.asyncio
async def test_get_project_owned_by_someone_else_raises_not_found(db_session: AsyncSession) -> None:
    """The core authorization guarantee: existence is never revealed to a
    non-owner — a wrong-owner lookup looks identical to a nonexistent id."""
    owner = await _make_user(db_session)
    other_user = await _make_user(db_session)
    service = ProjectService(db_session)
    project = await service.create_project(ProjectCreate(name="Owner's project"), owner.id)

    with pytest.raises(NotFoundException):
        await service.get_project(project.id, other_user.id)


@pytest.mark.asyncio
async def test_list_projects_returns_all(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    service = ProjectService(db_session)
    for i in range(3):
        await service.create_project(ProjectCreate(name=f"Project {i}"), user.id)

    projects, total = await service.list_projects(user.id)
    assert total == 3
    assert len(projects) == 3


@pytest.mark.asyncio
async def test_list_projects_excludes_other_users_projects(db_session: AsyncSession) -> None:
    user_a = await _make_user(db_session)
    user_b = await _make_user(db_session)
    service = ProjectService(db_session)
    await service.create_project(ProjectCreate(name="A's project"), user_a.id)
    await service.create_project(ProjectCreate(name="B's project 1"), user_b.id)
    await service.create_project(ProjectCreate(name="B's project 2"), user_b.id)

    projects, total = await service.list_projects(user_a.id)
    assert total == 1
    assert projects[0].name == "A's project"


@pytest.mark.asyncio
async def test_update_project(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    service = ProjectService(db_session)
    project = await service.create_project(ProjectCreate(name="Before"), user.id)
    updated = await service.update_project(project.id, ProjectUpdate(name="After"), user.id)
    assert updated.name == "After"


@pytest.mark.asyncio
async def test_update_project_owned_by_someone_else_raises_not_found(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session)
    other_user = await _make_user(db_session)
    service = ProjectService(db_session)
    project = await service.create_project(ProjectCreate(name="Before"), owner.id)

    with pytest.raises(NotFoundException):
        await service.update_project(project.id, ProjectUpdate(name="Hijacked"), other_user.id)


@pytest.mark.asyncio
async def test_delete_project(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    service = ProjectService(db_session)
    project = await service.create_project(ProjectCreate(name="Doomed"), user.id)
    await service.delete_project(project.id, user.id)
    with pytest.raises(NotFoundException):
        await service.get_project(project.id, user.id)


@pytest.mark.asyncio
async def test_delete_project_owned_by_someone_else_raises_not_found(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session)
    other_user = await _make_user(db_session)
    service = ProjectService(db_session)
    project = await service.create_project(ProjectCreate(name="Not yours"), owner.id)

    with pytest.raises(NotFoundException):
        await service.delete_project(project.id, other_user.id)

    # Confirm it's still there for the real owner.
    retrieved = await service.get_project(project.id, owner.id)
    assert retrieved.id == project.id
