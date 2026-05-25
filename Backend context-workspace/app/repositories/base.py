"""
app/repositories/base.py
─────────────────────────
Generic async repository providing standard CRUD operations.
Domain repositories inherit from this and add resource-specific queries.

Type parameter `M` is the SQLAlchemy ORM model class.
"""

from __future__ import annotations

import uuid
from typing import Any, Generic, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

M = TypeVar("M", bound=Base)


class BaseRepository(Generic[M]):
    """Async CRUD repository backed by an AsyncSession."""

    model: type[M]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get_by_id(self, id: uuid.UUID) -> M | None:
        result = await self.session.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def list_all(
        self,
        *,
        offset: int = 0,
        limit: int = 100,
        order_by: Any = None,
    ) -> list[M]:
        stmt = select(self.model)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count(self) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(self.model)
        )
        return result.scalar_one()

    # ── Write ─────────────────────────────────────────────────────────────────

    async def create(self, **kwargs: Any) -> M:
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()  # populate server-side defaults (id, timestamps)
        await self.session.refresh(instance)
        return instance

    async def update(self, instance: M, **kwargs: Any) -> M:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, instance: M) -> None:
        await self.session.delete(instance)
        await self.session.flush()
