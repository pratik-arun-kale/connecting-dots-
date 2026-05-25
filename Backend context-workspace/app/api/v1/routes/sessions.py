"""
app/api/v1/routes/sessions.py
──────────────────────────────
Session endpoints.

POST   /sessions                        – create a session
GET    /sessions/{project_id}           – list sessions for a project
GET    /sessions/detail/{session_id}    – get a single session
PATCH  /sessions/{session_id}/link      – bind a live tab URL to a session
"""

import uuid

from fastapi import APIRouter, Query, status

from app.dependencies import SessionServiceDep
from app.schemas.session import (
    LinkSessionRequest,
    SessionCreate,
    SessionListResponse,
    SessionResponse,
)

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post(
    "",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a session",
)
async def create_session(
    payload: SessionCreate,
    service: SessionServiceDep,
) -> SessionResponse:
    session = await service.create_session(payload)
    return SessionResponse.model_validate(session)


@router.get(
    "/{project_id}",
    response_model=SessionListResponse,
    summary="List sessions for a project",
)
async def list_sessions(
    project_id: uuid.UUID,
    service: SessionServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> SessionListResponse:
    sessions, total = await service.list_sessions_for_project(
        project_id, offset=offset, limit=limit
    )
    return SessionListResponse(
        items=[SessionResponse.model_validate(s) for s in sessions],
        total=total,
    )


@router.get(
    "/detail/{session_id}",
    response_model=SessionResponse,
    summary="Get a session by ID",
)
async def get_session(
    session_id: uuid.UUID,
    service: SessionServiceDep,
) -> SessionResponse:
    session = await service.get_session(session_id)
    return SessionResponse.model_validate(session)


@router.patch(
    "/{session_id}/link",
    response_model=SessionResponse,
    summary="Bind a live tab URL to a session",
    responses={
        409: {"description": "Session already linked to a different URL"},
        422: {"description": "URL does not belong to a supported AI platform"},
    },
)
async def link_session(
    session_id: uuid.UUID,
    payload: LinkSessionRequest,
    service: SessionServiceDep,
) -> SessionResponse:
    session = await service.link_session(session_id, payload)
    return SessionResponse.model_validate(session)
