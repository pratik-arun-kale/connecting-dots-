"""
app/services/context.py
────────────────────────
ContextService – business logic for the Context resource.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException
from app.core.logging import get_logger
from app.models.context import Context
from app.models.session import Session
from app.repositories.context import ContextRepository
from app.repositories.project import ProjectRepository
from app.repositories.session import SessionRepository
from app.schemas.capture import CaptureConversationRequest, CaptureConversationResponse
from app.schemas.context import ContextCapture, ContextCreate

logger = get_logger(__name__)


class ContextService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo         = ContextRepository(db)
        self._session_repo = SessionRepository(db)
        self._project_repo = ProjectRepository(db)

    async def capture_conversation(
        self,
        project_id: uuid.UUID,
        payload: CaptureConversationRequest,
    ) -> CaptureConversationResponse:
        """Main ingest path for the Chrome extension.

        Guarantees:
        - Idempotent: same idempotency_key returns the original context (HTTP 200).
        - Atomic: session upsert + context insert happen in one flush.
        - Project-scoped: verifies project exists before writing anything.
        """
        # 1. Guard: project must exist
        project = await self._project_repo.get_by_id(project_id)
        if project is None:
            raise NotFoundException(f"Project {project_id} not found.")

        # 2. Idempotency check — return existing context if key already seen
        existing = await self._repo.get_by_idempotency_key(payload.idempotency_key)
        if existing is not None:
            logger.info(
                "capture_idempotent_replay",
                idempotency_key=payload.idempotency_key,
                context_id=str(existing.id),
            )
            session = await self._session_repo.get_by_id(existing.session_id)
            return CaptureConversationResponse(
                context_id=existing.id,
                session_id=existing.session_id,
                title=existing.title or payload.title,
                messages_count=existing.messages_count,
                platform=existing.platform or payload.platform,
                chat_url=existing.chat_url or payload.chat_url,
                captured_at=existing.created_at,
                created=False,
            )

        # 3. Upsert session keyed on (project_id, platform, chat_url)
        session = await self._session_repo.get_capture_session(
            project_id, payload.platform, payload.chat_url
        )
        if session is None:
            session = await self._session_repo.create_capture_session(
                project_id=project_id,
                platform=payload.platform,
                chat_url=payload.chat_url,
                title=payload.title,
            )

        # 4. Build raw_content — preserve the full message array
        raw_content = {
            "title":      payload.title,
            "platform":   payload.platform,
            "chat_url":   payload.chat_url,
            "messages":   [m.model_dump() for m in payload.messages],
            "metadata":   payload.metadata or {},
        }

        # 5. Insert context
        context = await self._repo.create(
            session_id=session.id,
            idempotency_key=payload.idempotency_key,
            title=payload.title,
            messages_count=len(payload.messages),
            platform=payload.platform,
            chat_url=payload.chat_url,
            raw_content=raw_content,
            # Always include platform + url in metadata so legacy readers still work
            metadata_={"platform": payload.platform, "url": payload.chat_url, **(payload.metadata or {})},
        )

        logger.info(
            "conversation_captured",
            context_id=str(context.id),
            session_id=str(session.id),
            project_id=str(project_id),
            platform=payload.platform,
            messages=len(payload.messages),
        )

        return CaptureConversationResponse(
            context_id=context.id,
            session_id=session.id,
            title=payload.title,
            messages_count=len(payload.messages),
            platform=payload.platform,
            chat_url=payload.chat_url,
            captured_at=context.created_at,
            created=True,
        )

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
