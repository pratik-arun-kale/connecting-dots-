"""
app/api/v1/routes/contexts.py
──────────────────────────────
Context endpoints.

POST   /contexts                       – capture a context
GET    /contexts/{session_id}          – list contexts for a session
GET    /contexts/detail/{context_id}   – get a single context
"""

import uuid

from fastapi import APIRouter, Query, status

from app.dependencies import ContextServiceDep
from app.schemas.context import ContextCapture, ContextCreate, ContextListResponse, ContextResponse

router = APIRouter(prefix="/contexts", tags=["Contexts"])


@router.post(
    "/capture",
    response_model=ContextResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Capture context from Chrome extension (updates session tab_url)",
)
async def capture_context(
    payload: ContextCapture,
    service: ContextServiceDep,
) -> ContextResponse:
    context = await service.capture_context(payload)
    return ContextResponse.model_validate(context)


@router.post(
    "",
    response_model=ContextResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Capture a context",
)
async def create_context(
    payload: ContextCreate,
    service: ContextServiceDep,
) -> ContextResponse:
    context = await service.create_context(payload)
    return ContextResponse.model_validate(context)


@router.get(
    "/{session_id}",
    response_model=ContextListResponse,
    summary="List contexts for a session",
)
async def list_contexts(
    session_id: uuid.UUID,
    service: ContextServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> ContextListResponse:
    contexts, total = await service.list_contexts_for_session(
        session_id, offset=offset, limit=limit
    )
    return ContextListResponse(
        items=[ContextResponse.model_validate(c) for c in contexts],
        total=total,
    )


@router.get(
    "/detail/{context_id}",
    response_model=ContextResponse,
    summary="Get a context by ID",
)
async def get_context(
    context_id: uuid.UUID,
    service: ContextServiceDep,
) -> ContextResponse:
    context = await service.get_context(context_id)
    return ContextResponse.model_validate(context)
