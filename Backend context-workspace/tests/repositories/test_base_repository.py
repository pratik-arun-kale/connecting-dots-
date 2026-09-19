"""
tests/repositories/test_base_repository.py
────────────────────────────────────────────
Tests for the generic BaseRepository behaviour via the ProjectRepository.

Project.user_id is now a required, FK-enforced column (see the auth
implementation) — every project created here needs a real User row first.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User
from app.repositories.project import ProjectRepository
from app.repositories.user import UserRepository


async def _make_user(db_session: AsyncSession) -> User:
    return await UserRepository(db_session).create(
        email=f"{uuid.uuid4()}@test.com",
        password_hash=hash_password("irrelevant-password-123"),
    )


@pytest.mark.asyncio
async def test_create_and_get(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    repo = ProjectRepository(db_session)
    project = await repo.create(name="Repo Test", description=None, user_id=user.id)
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
    user = await _make_user(db_session)
    repo = ProjectRepository(db_session)
    assert await repo.count() == 0
    await repo.create(name="A", user_id=user.id)
    await repo.create(name="B", user_id=user.id)
    assert await repo.count() == 2


@pytest.mark.asyncio
async def test_update(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    repo = ProjectRepository(db_session)
    project = await repo.create(name="Old", user_id=user.id)
    updated = await repo.update(project, name="New")
    assert updated.name == "New"


@pytest.mark.asyncio
async def test_delete(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    repo = ProjectRepository(db_session)
    project = await repo.create(name="Gone", user_id=user.id)
    await repo.delete(project)
    result = await repo.get_by_id(project.id)
    assert result is None
