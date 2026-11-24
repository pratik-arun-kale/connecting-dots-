"""
app/api/v1/routes/trash.py
───────────────────────────
GET    /trash                         – what is in the caller's Trash
POST   /trash/notes/{id}/restore      – put a note back (and re-index it)
POST   /trash/projects/{id}/restore   – put a project back, with its notes
DELETE /trash/notes/{id}              – delete a trashed note for good
DELETE /trash/projects/{id}           – delete a trashed project for good

Deleting from anywhere else (DELETE /contexts/detail/{id}, /projects/{id})
moves things here. Another user's ids, and ids not in the Trash, are 404.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.settings import settings
from app.dependencies import CurrentUserDep, DbSession
from app.schemas.trash import (
    RestoredResponse,
    TrashedNoteResponse,
    TrashedProjectResponse,
    TrashResponse,
)
from app.services.trash import TrashService, purge_at

router = APIRouter(prefix="/trash", tags=["Trash"])


def get_trash_service(db: DbSession) -> TrashService:
    return TrashService(db)


TrashServiceDep = Annotated[TrashService, Depends(get_trash_service)]


@router.get("", response_model=TrashResponse, summary="List the caller's trashed projects and notes")
async def list_trash(current_user: CurrentUserDep, trash: TrashServiceDep) -> TrashResponse:
    projects, notes = await trash.list(current_user.id)
    return TrashResponse(
        retention_days=settings.trash_retention_days,
        projects=[
            TrashedProjectResponse(
                id=p.project.id,
                name=p.project.name,
                deleted_at=p.project.deleted_at,
                purge_at=purge_at(p.project.deleted_at),
                notes_count=p.notes_count,
            )
            for p in projects
        ],
        notes=[
            TrashedNoteResponse(
                id=n.context.id,
                project_id=n.project.id,
                project_name=n.project.name,
                title=n.context.title,
                user_title=n.context.user_title,
                content_md=(n.context.content_md or "")[:300] or None,
                platform=n.context.platform,
                kind=n.context.kind,
                deleted_at=n.context.deleted_at,
                purge_at=purge_at(n.context.deleted_at),
            )
            for n in notes
        ],
    )


@router.post("/notes/{context_id}/restore", response_model=RestoredResponse, summary="Restore a trashed note")
async def restore_note(
    context_id: uuid.UUID,
    current_user: CurrentUserDep,
    trash: TrashServiceDep,
) -> RestoredResponse:
    # Its chunks were removed when it was trashed. restore_note() marks it
    # unindexed, so the next search or Ask AI question puts them back.
    restored = await trash.restore_note(context_id, current_user.id)
    return RestoredResponse(id=restored.context.id, project_id=restored.project.id)


@router.post(
    "/projects/{project_id}/restore", response_model=RestoredResponse, summary="Restore a trashed project"
)
async def restore_project(
    project_id: uuid.UUID, current_user: CurrentUserDep, trash: TrashServiceDep
) -> RestoredResponse:
    project = await trash.restore_project(project_id, current_user.id)
    return RestoredResponse(id=project.id, project_id=project.id)


@router.delete(
    "/notes/{context_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a trashed note for good"
)
async def delete_note_forever(context_id: uuid.UUID, current_user: CurrentUserDep, trash: TrashServiceDep) -> None:
    await trash.delete_note_forever(context_id, current_user.id)


@router.delete(
    "/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a trashed project for good"
)
async def delete_project_forever(project_id: uuid.UUID, current_user: CurrentUserDep, trash: TrashServiceDep) -> None:
    await trash.delete_project_forever(project_id, current_user.id)
