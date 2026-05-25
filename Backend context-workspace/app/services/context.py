"""
app/services/context.py
────────────────────────
ContextService – business logic for the Context resource.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.core.logging import get_logger
from app.models.context import Context
from app.repositories.context import ContextRepository
from app.repositories.session import SessionRepository
from app.schemas.context import ContextCapture, ContextCreate

logger = get_logger(__name__)


class ContextService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = ContextRepository(db)
        self._session_repo = SessionRepository(db)

    async def list_contexts_for_session(
        self,
        session_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> tuple[list[Context], int]:
        session = await self._session_repo.get_by_id(session_id)
        if session is None:
            raise NotFoundException(f"Session {session_id} not found.")

        contexts, total = await self._repo.list_by_session(
            session_id, offset=offset, limit=limit
        )
        logger.debug("contexts_listed", session_id=str(session_id), total=total)
        return contexts, total

    async def get_context(self, context_id: uuid.UUID) -> Context:
        context = await self._repo.get_by_id(context_id)
        if context is None:
            raise NotFoundException(f"Context {context_id} not found.")
        return context

    async def list_contexts_for_project(
        self,
        project_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[Context], int]:
        contexts, total = await self._repo.list_by_project(
            project_id, offset=offset, limit=limit
        )
        logger.debug("project_contexts_listed", project_id=str(project_id), total=total)
        return contexts, total

    async def capture_context(self, payload: ContextCapture) -> Context:
        session = await self._session_repo.get_by_id(payload.session_id)
        if session is None:
            raise NotFoundException(f"Session {payload.session_id} not found.")

        # Record the tab URL on the session so the extension mapping is persisted
        await self._session_repo.update(session, tab_url=payload.url)

        context = await self._repo.create(
            session_id=payload.session_id,
            raw_content=payload.raw_content,
            metadata_={"platform": payload.platform, "url": payload.url},
        )
        logger.info(
            "context_captured",
            context_id=str(context.id),
            session_id=str(payload.session_id),
            platform=payload.platform,
        )
        return context

    async def create_context(self, payload: ContextCreate) -> Context:
        session = await self._session_repo.get_by_id(payload.session_id)
        if session is None:
            raise NotFoundException(f"Session {payload.session_id} not found.")

        context = await self._repo.create(
            session_id=payload.session_id,
            raw_content=payload.raw_content,
            structured_content=payload.structured_content,
            tags=payload.tags,
            metadata_=payload.metadata,
        )
        logger.info(
            "context_created",
            context_id=str(context.id),
            session_id=str(payload.session_id),
        )
        return context
