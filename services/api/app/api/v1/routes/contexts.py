"""
app/api/v1/routes/contexts.py
──────────────────────────────
Context endpoints.

POST   /contexts                       – capture a context
GET    /contexts                       – list the caller's notes across projects
GET    /contexts/{session_id}          – list contexts for a session
GET    /contexts/detail/{context_id}   – get a single context
PATCH  /contexts/detail/{context_id}   – update user_note, content_md and/or user_title (re-indexes on body/title edits)
DELETE /contexts/detail/{context_id}   – delete a note/context
"""

import uuid

from fastapi import APIRouter, Header, Query, status

from app.core.exceptions import UnprocessableException
from app.dependencies import ContextServiceDep, CurrentUserDep
from app.schemas.context import (
    ContextCapture,
    ContextCreate,
    ContextListResponse,
    ContextResponse,
    NoteListItem,
    NoteListResponse,
    NoteUpdateRequest,
)

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
    current_user: CurrentUserDep,
) -> ContextResponse:
    context = await service.capture_context(payload, current_user.id)
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
    current_user: CurrentUserDep,
) -> ContextResponse:
    context = await service.create_context(payload, current_user.id)
    return ContextResponse.model_validate(context)


@router.get(
    "",
    response_model=NoteListResponse,
    summary="List the caller's notes across all projects (or one), most recently edited first",
)
async def list_notes(
    service: ContextServiceDep,
    current_user: CurrentUserDep,
    project_id: uuid.UUID | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
) -> NoteListResponse:
    rows, total = await service.list_notes_for_owner(
        current_user.id, project_id=project_id, offset=offset, limit=limit
    )
    return NoteListResponse(
        items=[
            NoteListItem(**ContextResponse.model_validate(c).model_dump(), project_id=pid)
            for c, pid in rows
        ],
        total=total,
    )


@router.get(
    "/{session_id}",
    response_model=ContextListResponse,
    summary="List contexts for a session",
)
async def list_contexts(
    session_id: uuid.UUID,
    service: ContextServiceDep,
    current_user: CurrentUserDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> ContextListResponse:
    contexts, total = await service.list_contexts_for_session(
        session_id, current_user.id, offset=offset, limit=limit
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
    current_user: CurrentUserDep,
) -> ContextResponse:
    context = await service.get_context(context_id, current_user.id)
    return ContextResponse.model_validate(context)


def _parse_version(if_match: str | None) -> int | None:
    """If-Match as `3`, `"3"` or `W/"3"`; absent means "don't check"."""
    if if_match is None or not if_match.strip() or if_match.strip() == "*":
        return None
    value = if_match.strip().removeprefix("W/").strip('"')
    if not value.isdigit():
        raise UnprocessableException("If-Match must be the note's version number.")
    return int(value)


@router.patch(
    "/detail/{context_id}",
    response_model=ContextResponse,
    summary="Update a note's annotation (user_note) and/or a written note's body (content_md)",
    responses={409: {"description": "If-Match named an older version (code edit_conflict)"}},
)
async def update_note(
    context_id: uuid.UUID,
    payload: NoteUpdateRequest,
    service: ContextServiceDep,
    current_user: CurrentUserDep,
    if_match: str | None = Header(
        default=None,
        description="The note's `version` as loaded. If it changed since, the edit is refused with 409.",
    ),
) -> ContextResponse:
    context = await service.update_note(context_id, payload, current_user.id, if_match=_parse_version(if_match))
    # Nothing is re-indexed here: the edit bumped `version`, so the next search
    # or Ask AI question on the project re-indexes this note once, however
    # many autosaves came before it (ContextService.bring_index_up_to_date).
    return ContextResponse.model_validate(context)


@router.delete(
    "/detail/{context_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a note/context",
)
async def delete_note(
    context_id: uuid.UUID,
    service: ContextServiceDep,
    current_user: CurrentUserDep,
) -> None:
    await service.delete_note(context_id, current_user.id)
