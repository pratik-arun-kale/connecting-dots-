"""
tests/repositories/test_base_repository.py
────────────────────────────────────────────
Tests for the generic BaseRepository behaviour via the ProjectRepository.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.project import ProjectRepository


@pytest.mark.asyncio
async def test_create_and_get(db_session: AsyncSession) -> None:
    repo = ProjectRepository(db_session)
    project = await repo.create(name="Repo Test", description=None)
    assert project.id is not None

    fetched = await repo.get_by_id(project.id)
    assert fetched is not None
    assert fetched.name == "Repo Test"


@pytest.mark.asyncio
async def test_get_by_id_missing_returns_none(db_session: AsyncSession) -> None:
    repo = ProjectRepository(db_session)
    result = await repo.get_by_id(uuid.uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_count(db_session: AsyncSession) -> None:
    repo = ProjectRepository(db_session)
    assert await repo.count() == 0
    await repo.create(name="A")
    await repo.create(name="B")
    assert await repo.count() == 2


@pytest.mark.asyncio
async def test_update(db_session: AsyncSession) -> None:
    repo = ProjectRepository(db_session)
    project = await repo.create(name="Old")
    updated = await repo.update(project, name="New")
    assert updated.name == "New"


@pytest.mark.asyncio
async def test_delete(db_session: AsyncSession) -> None:
    repo = ProjectRepository(db_session)
    project = await repo.create(name="Gone")
    await repo.delete(project)
    result = await repo.get_by_id(project.id)
    assert result is None
