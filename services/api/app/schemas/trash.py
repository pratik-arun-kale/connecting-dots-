"""
app/schemas/trash.py
─────────────────────
GET /trash and the restore responses.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.base import AppBaseModel


class TrashedProjectResponse(AppBaseModel):
    id: uuid.UUID
    name: str
    deleted_at: datetime
    purge_at: datetime        # when it is removed for good
    notes_count: int


class TrashedNoteResponse(AppBaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    title: str | None
    user_title: str | None
    content_md: str | None    # the first 300 characters, for the list
    platform: str | None
    kind: str
    deleted_at: datetime
    purge_at: datetime


class TrashResponse(AppBaseModel):
    retention_days: int
    projects: list[TrashedProjectResponse]
    notes: list[TrashedNoteResponse]


class RestoredResponse(AppBaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
